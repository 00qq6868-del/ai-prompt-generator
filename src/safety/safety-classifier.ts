import type { SafetyClassification } from "../domain/types.js";

const DISALLOWED_PATTERNS = [
  /真实.*(攻击|入侵|拿下|getshell|提权)/i,
  /(钓鱼|phishing).*(工具|页面|脚本|套件)/i,
  /(窃取|盗取|steal|dump).*(密码|cookie|token|凭证|credential)/i,
  /(免杀|bypass.*av|绕过检测|隐藏持久化|persistence)/i,
  /(exploit|payload).*(真实|可执行|批量|自动化)/i,
  /(绕过|破解).*(付费|许可|license|drm|风控)/i,
];

const LAB_PATTERNS = [
  /(ctf|靶场|lab|实验室|自有|授权|企业审计|authorized|defensive|防御|培训|教学)/i,
];

export function classifySafetyIntent(text: string): SafetyClassification {
  if (DISALLOWED_PATTERNS.some((pattern) => pattern.test(text))) {
    return "disallowed_weaponization";
  }
  if (LAB_PATTERNS.some((pattern) => pattern.test(text))) {
    return "allowed_lab_or_ctf";
  }
  if (/(红队|逆向|漏洞|攻击|注入|渗透|red team|reverse|vulnerability|exploit|injection)/i.test(text)) {
    return "needs_authorization_clarification";
  }
  return "allowed_defensive";
}
