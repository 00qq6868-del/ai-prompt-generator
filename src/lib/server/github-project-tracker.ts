import { exportDatasetRow } from "@/lib/server/github-dataset";
import {
  GITHUB_PROJECT_SEEDS,
  GithubProjectGroup,
  GithubSeedProject,
  GithubTrackedProject,
  buildPendingProject,
  extractProjectRules,
  scoreGithubProject,
  selectTopProjects,
} from "@/lib/github-project-tracker";

interface GithubRepoApiResponse {
  full_name?: string;
  html_url?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  pushed_at?: string;
  updated_at?: string;
  description?: string | null;
  default_branch?: string;
}

async function fetchGithubRepo(seed: GithubSeedProject, token?: string): Promise<GithubTrackedProject> {
  const res = await fetch(`https://api.github.com/repos/${seed.repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return {
      ...buildPendingProject(seed),
      verificationStatus: "failed",
      scoreReasons: [`GitHub API failed with ${res.status}; keeping seed as pending.`],
    };
  }
  const data = (await res.json()) as GithubRepoApiResponse;
  const project: GithubTrackedProject = {
    ...seed,
    repo: data.full_name || seed.repo,
    url: data.html_url || seed.url,
    stars: Number.isFinite(Number(data.stargazers_count)) ? Number(data.stargazers_count) : null,
    forks: Number.isFinite(Number(data.forks_count)) ? Number(data.forks_count) : null,
    openIssues: Number.isFinite(Number(data.open_issues_count)) ? Number(data.open_issues_count) : null,
    pushedAt: data.pushed_at || null,
    updatedAt: data.updated_at || null,
    description: data.description || "",
    defaultBranch: data.default_branch || "",
    verifiedAt: new Date().toISOString(),
    verificationStatus: "verified",
    qualityScore: 0,
    scoreReasons: [],
    extractedRules: [],
  };
  const scored = scoreGithubProject(project);
  return {
    ...project,
    qualityScore: scored.score,
    scoreReasons: scored.reasons,
    extractedRules: extractProjectRules(project),
  };
}

export async function refreshGithubProjectTracker(): Promise<{
  generatedAt: string;
  projects: GithubTrackedProject[];
  topByGroup: Record<GithubProjectGroup, GithubTrackedProject[]>;
  extractedRules: string[];
  githubExport: { synced: boolean; filePath: string };
}> {
  const token = process.env.GITHUB_DATA_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const projects = await Promise.all(GITHUB_PROJECT_SEEDS.map((seed) => fetchGithubRepo(seed, token)));
  const groups: GithubProjectGroup[] = ["hallucination", "prompt_optimization", "gpt_image_2"];
  const topByGroup = Object.fromEntries(groups.map((group) => [group, selectTopProjects(projects, group)])) as Record<GithubProjectGroup, GithubTrackedProject[]>;
  const extractedRules = Array.from(new Set(projects.flatMap((project) => project.extractedRules)));
  const generatedAt = new Date().toISOString();
  const row = {
    schema_version: "1.0",
    generated_at: generatedAt,
    project_count: projects.length,
    top_by_group: Object.fromEntries(
      Object.entries(topByGroup).map(([group, items]) => [
        group,
        items.map((item) => ({
          repo: item.repo,
          url: item.url,
          stars: item.stars,
          qualityScore: item.qualityScore,
          verificationStatus: item.verificationStatus,
        })),
      ]),
    ),
    extracted_rules: extractedRules,
  };
  const githubExport = await exportDatasetRow("github-projects", {
    ...row,
    id: `github-projects-${generatedAt}`,
    timestamp: Date.now(),
  });
  return {
    generatedAt,
    projects,
    topByGroup,
    extractedRules,
    githubExport: { synced: githubExport.synced, filePath: githubExport.filePath },
  };
}
