/**
 * PolicyActionsBar.tsx
 *
 * Shared "Reset · Save draft · Publish changes" action row used across the
 * AI Studio sub-tabs (Permissions, Knowledge, Reasoning, Safety).
 *
 * Each button triggers an ActionModal confirmation tailored to the action's
 * impact (reset → danger, save draft → default, publish → warning) before
 * the real handler runs. This way the user always sees what is about to
 * happen and the consequences for the live runtime.
 */

import React, { useState } from 'react';
import { ActionModal, type ModalConsideration, type ModalContextItem, type ModalStep, type ModalVariant } from './ActionModal';

type ActionKind = 'reset' | 'save' | 'publish' | null;

interface Props {
  onReset: () => void | Promise<void>;
  onSaveDraft: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  resetting?: boolean;
  saving?: boolean;
  publishing?: boolean;
  /** Agent or scope name shown inside the confirmation modal context. */
  agentName?: string;
  /** Section name for human-readable context, e.g. "Permissions". */
  scope?: string;
  /** When provided, replaces the default button styling (e.g. minimal vs accent). */
  layout?: 'default' | 'compact';
}

export default function PolicyActionsBar({
  onReset,
  onSaveDraft,
  onPublish,
  resetting,
  saving,
  publishing,
  agentName = 'this agent',
  scope = 'this section',
  layout = 'default',
}: Props) {
  const [activeModal, setActiveModal] = useState<ActionKind>(null);

  const config: Record<Exclude<ActionKind, null>, {
    variant: ModalVariant;
    icon: string;
    title: string;
    subtitle: string;
    confirmLabel: string;
    steps: ModalStep[];
    considerations: ModalConsideration[];
    handler: () => void | Promise<void>;
    loading: boolean;
  }> = {
    reset: {
      variant: 'danger',
      icon: 'restart_alt',
      title: 'Reset to last published version',
      subtitle: `Discard your unsaved draft changes for ${scope.toLowerCase()} on ${agentName}.`,
      confirmLabel: 'Reset draft',
      steps: [
        { text: 'Discard the local draft', detail: 'Any unsaved edits made on this screen are removed and replaced with the last published policy bundle.' },
        { text: 'Re-fetch the live values', detail: 'The form fields refresh to show the active runtime configuration so you can start over from a clean slate.' },
        { text: 'No backend changes happen', detail: 'The published policy version stays exactly as it is — only your in-progress draft is dropped.' },
      ],
      considerations: [
        { text: 'Reset cannot be undone — any in-progress edits will be lost.' },
        { text: 'The runtime is unaffected because the draft was never published.' },
      ],
      handler: onReset,
      loading: !!resetting,
    },
    save: {
      variant: 'default',
      icon: 'save',
      title: 'Save draft',
      subtitle: `Persist your in-progress ${scope.toLowerCase()} changes for ${agentName} without affecting the live runtime.`,
      confirmLabel: 'Save draft',
      steps: [
        { text: 'Write the draft to the policy bundle', detail: 'Your edits are saved as a new draft revision linked to this agent.' },
        { text: 'Keep the runtime untouched', detail: 'The agent continues to use the previously published version — saving does NOT activate any change.' },
        { text: 'Make the draft resumable', detail: 'You can come back later and continue editing or publish whenever you are ready.' },
      ],
      considerations: [
        { text: 'Saving creates a new draft revision — no live behavior changes until you publish.' },
        { text: 'Other admins viewing this agent will see the draft as "in progress".' },
      ],
      handler: onSaveDraft,
      loading: !!saving,
    },
    publish: {
      variant: 'warning',
      icon: 'rocket_launch',
      title: 'Publish changes',
      subtitle: `Promote the current draft of ${scope.toLowerCase()} for ${agentName} to live runtime.`,
      confirmLabel: 'Publish changes',
      steps: [
        { text: 'Validate the draft against runtime invariants', detail: 'The system checks that the draft is internally consistent before going live.' },
        { text: 'Increment the version number', detail: 'A new published version is recorded with your user as the publisher and timestamp.' },
        { text: 'Activate the new policy across the runtime', detail: `The agent immediately starts using the new ${scope.toLowerCase()} configuration on every fresh invocation.` },
        { text: 'Audit the change', detail: 'A signed audit entry is added to the change log so the transition is traceable.' },
      ],
      considerations: [
        { text: 'Publishing affects live traffic immediately — every new task hitting this agent will use the new configuration.' },
        { text: 'You can rollback later via the Reset button or the version history, but in-flight executions already started will not be re-run.' },
        { text: 'Make sure connected tools, approvals and rules still align with the change you are about to publish.' },
      ],
      handler: onPublish,
      loading: !!publishing,
    },
  };

  const current = activeModal ? config[activeModal] : null;
  const contextItems: ModalContextItem[] | undefined = current ? [
    { label: 'Section', value: scope },
    { label: 'Agent', value: agentName },
    { label: 'Action', value: current.title },
  ] : undefined;

  const isCompact = layout === 'compact';
  const baseBtn = 'inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <div className={`flex items-center ${isCompact ? 'gap-2' : 'gap-2.5'}`}>
        <button
          type="button"
          onClick={() => setActiveModal('reset')}
          disabled={!!resetting}
          className={`${baseBtn} text-[#646462] dark:text-[#c4c4c2] hover:bg-[#f8f8f7]`}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => setActiveModal('save')}
          disabled={!!saving}
          className={`${baseBtn} text-[#1a1a1a] dark:text-[#a4a4a2] bg-white border border-[#e9eae6] dark:border-[#e9eae6] hover:bg-[#f8f8f7] dark:hover:bg-gray-700 shadow-[0px_1px_2px_rgba(20,20,20,0.04)]`}
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={() => setActiveModal('publish')}
          disabled={!!publishing || !!saving}
          className={`${baseBtn} text-white bg-[#1a1a1a] hover:bg-gray-800 dark:bg-white dark:text-[#1a1a1a] dark:hover:bg-[#ededea] shadow-[0px_1px_4px_rgba(20,20,20,0.08)]`}
        >
          Publish changes
        </button>
      </div>

      {current && (
        <ActionModal
          open={Boolean(activeModal)}
          onClose={() => setActiveModal(null)}
          onConfirm={async () => {
            const action = activeModal;
            setActiveModal(null);
            if (action) {
              await config[action].handler();
            }
          }}
          loading={current.loading}
          variant={current.variant}
          icon={current.icon}
          title={current.title}
          subtitle={current.subtitle}
          context={contextItems}
          steps={current.steps}
          considerations={current.considerations}
          confirmLabel={current.confirmLabel}
        />
      )}
    </>
  );
}
