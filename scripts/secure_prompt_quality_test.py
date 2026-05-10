#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Secure local prompt quality test.
安全本地提示词质量测试。

English: This script auto-loads an API key from ignored local files, falls back to
a masked GUI popup, calls an OpenAI-compatible chat endpoint, writes only a
sanitized report, and clears key variables after use on a best-effort basis.

中文：本脚本会优先从被 Git 忽略的本地文件读取 API key，找不到时弹出
masked GUI 输入框，调用 OpenAI 兼容 chat 接口，只写入脱敏报告，并在调用
结束后尽力清理内存中的密钥变量。
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = PROJECT_ROOT / "reports" / "secure-prompt-quality-test"
ENV_FILES = [
    PROJECT_ROOT / ".env.local",
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / "config" / "local.env",
    PROJECT_ROOT / ".secure" / "ai_prompt_api_key.env",
]
KEY_NAMES = ("OPENAI_API_KEY", "CUSTOM_API_KEY", "AIHUBMIX_API_KEY")
BASE_URL_NAMES = ("OPENAI_BASE_URL", "CUSTOM_BASE_URL", "AIHUBMIX_BASE_URL")
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-5.5-pro"


@dataclass
class KeySource:
    # English: Where the key came from. 中文：密钥来源。
    name: str
    # English: Env/config variable name. 中文：环境变量或配置字段名。
    key_name: str


def parse_env_file(path: Path) -> Dict[str, str]:
    """Parse simple KEY=VALUE env files. / 解析简单 KEY=VALUE 环境文件。"""
    values: Dict[str, str] = {}
    if not path.exists() or not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value:
            values[key] = value
    return values


def first_non_empty(values: Iterable[Tuple[str, str]]) -> Optional[Tuple[str, str]]:
    """Return first non-empty pair. / 返回第一个非空键值对。"""
    for key, value in values:
        if value and value.strip():
            return key, value.strip()
    return None


def load_local_config() -> Tuple[Optional[str], Optional[KeySource], str, str]:
    """
    Load key/base/model from env and local files.
    从环境变量和本地文件读取密钥、base URL 和模型。
    """
    env_values: Dict[str, str] = dict(os.environ)
    for env_file in ENV_FILES:
        env_values = {**parse_env_file(env_file), **env_values}

    key_pair = first_non_empty((name, env_values.get(name, "")) for name in KEY_NAMES)
    base_pair = first_non_empty((name, env_values.get(name, "")) for name in BASE_URL_NAMES)
    model = env_values.get("PROMPT_TEST_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    base_url = (base_pair[1] if base_pair else DEFAULT_BASE_URL).rstrip("/")

    if key_pair:
        return key_pair[1], KeySource("local-env-or-config", key_pair[0]), base_url, model
    return None, None, base_url, model


def popup_api_key() -> str:
    """
    Ask for a key with a masked GUI popup.
    使用 masked GUI 弹窗请求输入密钥。
    """
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception as exc:  # pragma: no cover - depends on local GUI support
        raise RuntimeError(
            "No local API key was found and tkinter is unavailable. "
            "未找到本地 API key，且 tkinter 不可用。"
        ) from exc

    result = {"key": ""}

    root = tk.Tk()
    root.title("Secure API Key Input / 安全 API Key 输入")
    root.geometry("520x180")
    root.resizable(False, False)

    label = tk.Label(
        root,
        text=(
            "Enter a local API key for this one test only.\n"
            "请输入仅用于本次测试的本地 API key。"
        ),
        justify="left",
        padx=16,
        pady=12,
    )
    label.pack(fill="x")

    entry = tk.Entry(root, show="*", width=64)
    entry.pack(padx=16, pady=6)
    entry.focus_set()

    def submit() -> None:
        value = entry.get().strip()
        if len(value) < 8:
            messagebox.showerror("Invalid / 无效", "API key looks too short. / API key 看起来太短。")
            return
        result["key"] = value
        entry.delete(0, tk.END)
        root.destroy()

    button = tk.Button(root, text="Run Test / 运行测试", command=submit)
    button.pack(pady=12)
    root.bind("<Return>", lambda _event: submit())
    root.mainloop()

    return result["key"]


def sanitize_text(text: str, api_key: Optional[str]) -> str:
    """Remove secrets from text. / 从文本中移除密钥。"""
    safe = text or ""
    if api_key:
        safe = safe.replace(api_key, "[REDACTED_API_KEY]")
        if len(api_key) >= 12:
            safe = safe.replace(api_key[:6], "[REDACTED_PREFIX]")
            safe = safe.replace(api_key[-6:], "[REDACTED_SUFFIX]")
    return safe


def build_test_messages() -> list[dict[str, str]]:
    """Build bilingual quality-test messages. / 构造双语质量测试消息。"""
    system_prompt = (
        "You are an elite bilingual prompt architect and QA specialist. "
        "Return a compact bilingual answer with English and Chinese sections. "
        "Preserve requirements, prevent hallucinations, explain model visibility, "
        "and include secure API-key handling rules. If a fact is unknown, write Unknown."
    )
    user_prompt = (
        "Create a bilingual prompt-system summary for a secure AI prompt project. "
        "It must include expert knowledge injection, zero-loss requirement merging, "
        "anti-hallucination rules, model visibility reasons for gpt-5.5-like models, "
        "and secure local API-key testing behavior. "
        "Also include a short self-check with scores."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def call_chat_completion(api_key: str, base_url: str, model: str) -> Tuple[int, str]:
    """
    Call an OpenAI-compatible chat completion endpoint.
    调用 OpenAI 兼容 chat completion endpoint。
    """
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": build_test_messages(),
        "temperature": 0.2,
        "max_tokens": 1800,
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ai-prompt-generator-secure-local-test/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        status = int(response.status)
        raw = response.read().decode("utf-8", errors="replace")
        return status, raw


def extract_content(raw_response: str) -> str:
    """Extract assistant content if possible. / 尽量提取助手输出。"""
    try:
        data = json.loads(raw_response)
        choices = data.get("choices") or []
        if choices:
            message = choices[0].get("message") or {}
            content = message.get("content")
            if isinstance(content, str):
                return content
    except Exception:
        return raw_response
    return raw_response


def quality_checks(content: str) -> Dict[str, bool]:
    """Run local output checks. / 运行本地输出检查。"""
    lowered = content.lower()
    return {
        "has_english": "english" in lowered or "system prompt" in lowered,
        "has_chinese": any("\u4e00" <= char <= "\u9fff" for char in content),
        "mentions_anti_hallucination": "hallucination" in lowered or "幻觉" in content,
        "mentions_model_visibility": "model" in lowered and ("visible" in lowered or "不可见" in content),
        "mentions_secure_key": "api key" in lowered and ("redact" in lowered or "密钥" in content),
        "does_not_contain_obvious_secret": "sk-" not in lowered and "api_key=" not in lowered,
    }


def write_report(report: Dict[str, object]) -> Path:
    """Write sanitized report under ignored reports/. / 写入 Git 忽略的脱敏报告。"""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = REPORT_DIR / f"secure-prompt-quality-test-{timestamp}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def destroy_key(api_key: Optional[str]) -> None:
    """
    Best-effort key cleanup.
    尽力清理密钥变量。

    English: Python strings are immutable, so absolute memory destruction cannot
    be guaranteed. We still overwrite a bytearray copy and delete references.
    中文：Python 字符串不可变，因此无法保证绝对清除内存；这里仍会覆盖
    bytearray 副本并删除变量引用，做到合理范围内的最大安全。
    """
    if not api_key:
        return
    holder = bytearray(api_key.encode("utf-8", errors="ignore"))
    for index in range(len(holder)):
        holder[index] = 0
    del holder


def main() -> int:
    """Program entry. / 程序入口。"""
    api_key: Optional[str] = None
    source: Optional[KeySource] = None
    started = time.time()

    try:
        api_key, source, base_url, model = load_local_config()
        if not api_key:
            api_key = popup_api_key()
            source = KeySource("masked-popup", "runtime-only")

        status, raw_response = call_chat_completion(api_key, base_url, model)
        content = extract_content(raw_response)
        checks = quality_checks(content)
        ok = status < 400 and all(checks.values())

        report = {
            "ok": ok,
            "status": status,
            "model": model,
            "base_url": base_url,
            "key_source": source.name if source else "unknown",
            "key_name": source.key_name if source else "unknown",
            "elapsed_ms": round((time.time() - started) * 1000),
            "checks": checks,
            "content_preview": sanitize_text(content[:3000], api_key),
        }
        report_path = write_report(report)
        print(json.dumps({**report, "report_path": str(report_path)}, ensure_ascii=False, indent=2))
        return 0 if ok else 1

    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:3000]
        report = {
            "ok": False,
            "status": exc.code,
            "error_type": "http_error",
            "elapsed_ms": round((time.time() - started) * 1000),
            "detail": sanitize_text(detail, api_key),
            "suggestion": (
                "Check model visibility, account tier, API key permission, base URL, "
                "and whether the relay supports this model. / 检查模型可见性、账户层级、"
                "API key 权限、base URL，以及中转站是否支持该模型。"
            ),
        }
        path = write_report(report)
        print(json.dumps({**report, "report_path": str(path)}, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:
        report = {
            "ok": False,
            "status": 0,
            "error_type": exc.__class__.__name__,
            "elapsed_ms": round((time.time() - started) * 1000),
            "detail": sanitize_text(str(exc), api_key),
            "trace": sanitize_text(traceback.format_exc(limit=3), api_key),
        }
        path = write_report(report)
        print(json.dumps({**report, "report_path": str(path)}, ensure_ascii=False, indent=2))
        return 1
    finally:
        destroy_key(api_key)
        api_key = None
        del api_key


if __name__ == "__main__":
    sys.exit(main())
