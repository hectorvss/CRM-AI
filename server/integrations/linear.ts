/**
 * server/integrations/linear.ts
 *
 * Linear GraphQL adapter. Coverage focused on what the AI agent +
 * inbox pipeline needs to escalate cases to engineering:
 *   - Viewer / current organization (identity + workspace)
 *   - Teams (list)
 *   - Issues: create, update, search, get with comments + history
 *   - Comments: list per issue, create
 *   - Issue states: list per team (so create/update use the right id)
 *   - Issue labels: list, create
 *   - Projects + cycles (read-only, used for routing)
 *   - Users (lookup by email for assignment)
 *   - Webhooks (CRUD via Webhook* mutations)
 *
 * Auth: Bearer access_token over GraphQL (POST { query, variables }).
 *
 * Docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import { logger } from '../utils/logger.js';
import { LINEAR_GRAPHQL } from './linear-oauth.js';

export interface LinearIssue {
  id: string;
  identifier: string;     // e.g. ENG-123
  title: string;
  description: string | null;
  url: string;
  priority: 0 | 1 | 2 | 3 | 4;
  estimate: number | null;
  state: { id: string; name: string; type: string };
  team: { id: string; key: string; name: string };
  assignee: { id: string; email: string; name: string } | null;
  labels: { nodes: Array<{ id: string; name: string }> };
  createdAt: string;
  updatedAt: string;
}

export class LinearAdapter {
  constructor(private readonly accessToken: string) {}

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(LINEAR_GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: this.accessToken.startsWith('Bearer ')
          ? this.accessToken
          : `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error(`linear graphql ${res.status}: ${text.slice(0, 240)}`);
      err.statusCode = res.status;
      throw err;
    }
    const data = (await res.json()) as any;
    if (data?.errors?.length) {
      const err: any = new Error(`linear graphql errors: ${data.errors.map((e: any) => e.message).join('; ')}`);
      err.linearErrors = data.errors;
      throw err;
    }
    return data.data as T;
  }

  // ── Identity / health ─────────────────────────────────────────────────────

  async viewer(): Promise<{ viewer: { id: string; email: string; name: string; organization: { id: string; name: string; urlKey: string } } }> {
    return this.gql<any>(`
      query Viewer {
        viewer {
          id email name
          organization { id name urlKey }
        }
      }
    `);
  }

  async ping(): Promise<{ ok: boolean; viewer?: any }> {
    try {
      const r = await this.viewer();
      return { ok: true, viewer: r.viewer };
    } catch (err: any) {
      logger.warn('linear ping failed', { error: err?.message });
      return { ok: false };
    }
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(): Promise<{ teams: { nodes: Array<{ id: string; key: string; name: string; private: boolean }> } }> {
    return this.gql<any>(`
      query Teams {
        teams(first: 100, orderBy: updatedAt) {
          nodes { id key name private }
        }
      }
    `);
  }

  async listTeamStates(teamId: string): Promise<{ team: { states: { nodes: Array<{ id: string; name: string; type: string; position: number }> } } }> {
    return this.gql<any>(`
      query TeamStates($teamId: String!) {
        team(id: $teamId) {
          states(first: 50) { nodes { id name type position } }
        }
      }
    `, { teamId });
  }

  async listTeamLabels(teamId: string): Promise<{ team: { labels: { nodes: Array<{ id: string; name: string; color: string }> } } }> {
    return this.gql<any>(`
      query TeamLabels($teamId: String!) {
        team(id: $teamId) {
          labels(first: 100) { nodes { id name color } }
        }
      }
    `, { teamId });
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  async getIssue(id: string): Promise<{ issue: LinearIssue & { comments: { nodes: any[] } } }> {
    return this.gql<any>(`
      query Issue($id: String!) {
        issue(id: $id) {
          id identifier title description url priority estimate
          state { id name type }
          team { id key name }
          assignee { id email name }
          labels { nodes { id name } }
          createdAt updatedAt
          comments(first: 50) {
            nodes { id body createdAt user { id name email } }
          }
        }
      }
    `, { id });
  }

  async createIssue(payload: {
    teamId: string;
    title: string;
    description?: string;
    priority?: 0 | 1 | 2 | 3 | 4;
    stateId?: string;
    assigneeId?: string;
    labelIds?: string[];
    projectId?: string;
    cycleId?: string;
    estimate?: number;
  }): Promise<{ issueCreate: { success: boolean; issue: LinearIssue } }> {
    return this.gql<any>(`
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id identifier title url priority
            state { id name type }
            team { id key name }
          }
        }
      }
    `, { input: payload });
  }

  async updateIssue(id: string, payload: Partial<{
    title: string;
    description: string;
    priority: 0 | 1 | 2 | 3 | 4;
    stateId: string;
    assigneeId: string;
    labelIds: string[];
    estimate: number;
  }>): Promise<{ issueUpdate: { success: boolean; issue: LinearIssue } }> {
    return this.gql<any>(`
      mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { id identifier title url state { id name type } }
        }
      }
    `, { id, input: payload });
  }

  async searchIssues(opts?: {
    query?: string;
    teamId?: string;
    stateType?: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
    first?: number;
    after?: string;
  }): Promise<{ issues: { nodes: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }> {
    return this.gql<any>(`
      query SearchIssues($filter: IssueFilter, $first: Int, $after: String) {
        issues(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
          nodes {
            id identifier title url priority
            state { id name type }
            team { id key name }
            assignee { id email name }
            labels { nodes { id name } }
            createdAt updatedAt
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, {
      filter: {
        ...(opts?.teamId ? { team: { id: { eq: opts.teamId } } } : {}),
        ...(opts?.stateType ? { state: { type: { eq: opts.stateType } } } : {}),
        ...(opts?.query ? { searchableContent: { contains: opts.query } } : {}),
      },
      first: opts?.first ?? 25,
      after: opts?.after,
    });
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async createComment(issueId: string, body: string, parentId?: string): Promise<{ commentCreate: { success: boolean; comment: { id: string; body: string; url: string } } }> {
    return this.gql<any>(`
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment { id body url }
        }
      }
    `, { input: { issueId, body, parentId } });
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<{ users: { nodes: Array<{ id: string; email: string; name: string; active: boolean }> } }> {
    return this.gql<any>(`
      query Users($email: String!) {
        users(filter: { email: { eq: $email } }, first: 1) {
          nodes { id email name active }
        }
      }
    `, { email });
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async createLabel(teamId: string, name: string, color?: string): Promise<{ issueLabelCreate: { success: boolean; issueLabel: { id: string; name: string } } }> {
    return this.gql<any>(`
      mutation LabelCreate($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id name color }
        }
      }
    `, { input: { teamId, name, color } });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(teamId?: string): Promise<{ projects: { nodes: Array<{ id: string; name: string; state: string; progress: number }> } }> {
    if (teamId) {
      return this.gql<any>(`
        query TeamProjects($teamId: String!) {
          team(id: $teamId) {
            projects(first: 100) { nodes { id name state progress } }
          }
        }
      `, { teamId }).then((r: any) => ({ projects: r.team?.projects ?? { nodes: [] } }));
    }
    return this.gql<any>(`
      query Projects {
        projects(first: 100) { nodes { id name state progress } }
      }
    `);
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async createWebhook(payload: {
    url: string;
    label?: string;
    teamId?: string;
    resourceTypes: Array<'Issue' | 'Comment' | 'Project' | 'Cycle' | 'User' | 'Reaction' | 'IssueLabel' | 'IssueAttachment'>;
    enabled?: boolean;
    secret?: string;
  }): Promise<{ webhookCreate: { success: boolean; webhook: { id: string; url: string; enabled: boolean; secret: string | null } } }> {
    return this.gql<any>(`
      mutation WebhookCreate($input: WebhookCreateInput!) {
        webhookCreate(input: $input) {
          success
          webhook { id url enabled secret }
        }
      }
    `, { input: payload });
  }

  async deleteWebhook(id: string): Promise<{ webhookDelete: { success: boolean } }> {
    return this.gql<any>(`
      mutation WebhookDelete($id: String!) {
        webhookDelete(id: $id) { success }
      }
    `, { id });
  }

  async listWebhooks(): Promise<{ webhooks: { nodes: Array<{ id: string; url: string; label: string | null; enabled: boolean; resourceTypes: string[] }> } }> {
    return this.gql<any>(`
      query Webhooks {
        webhooks(first: 100) {
          nodes { id url label enabled resourceTypes }
        }
      }
    `);
  }
}
