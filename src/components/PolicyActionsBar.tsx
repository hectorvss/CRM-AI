import React, { useMemo, useState } from 'react';
import { ActionModal, type ModalConsideration, type ModalContextItem, type ModalStep, type ModalVariant } from './ActionModal';
import { MinimalButton } from './MinimalCategoryShell';

export type PolicyActionKey = 'reset' | 'save' | 'publish';

export type PolicyActionConfig = {
  key: PolicyActionKey;
  label: string;
  icon: string;
  variant?: ModalVariant;
  title: string;
  subtitle: string;
  confirmLabel: string;
  context?: ModalContextItem[];
  steps: ModalStep[];
  considerations?: ModalConsideration[];
  noteLabel?: string;
  notePlaceholder?: string;
  noteValue?: string;
  onNoteChange?: (value: string) => void;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  buttonVariant?: 'solid' | 'ghost' | 'outline';
};

type PolicyActionsBarProps = {
  actions: PolicyActionConfig[];
  className?: string;
};

export default function PolicyActionsBar({ actions, className = '' }: PolicyActionsBarProps) {
  const [activeAction, setActiveAction] = useState<PolicyActionKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  const currentAction = useMemo(
    () => actions.find((action) => action.key === activeAction) || null,
    [actions, activeAction],
  );

  const close = () => {
    if (!confirming) setActiveAction(null);
  };

  const handleConfirm = async () => {
    if (!currentAction) return;
    setConfirming(true);
    try {
      await currentAction.onConfirm();
      setActiveAction(null);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {actions.map((action) => (
        <React.Fragment key={action.key}>
          <MinimalButton
            variant={action.buttonVariant || (action.key === 'reset' ? 'ghost' : action.key === 'save' ? 'outline' : 'solid')}
            onClick={() => setActiveAction(action.key)}
            disabled={action.disabled || action.loading}
          >
            {action.label}
          </MinimalButton>
        </React.Fragment>
      ))}

      {currentAction ? (
        <ActionModal
          open={Boolean(currentAction)}
          onClose={close}
          onConfirm={handleConfirm}
          loading={confirming || !!currentAction.loading}
          variant={currentAction.variant || 'default'}
          icon={currentAction.icon}
          title={currentAction.title}
          subtitle={currentAction.subtitle}
          context={currentAction.context}
          steps={currentAction.steps}
          considerations={currentAction.considerations}
          confirmLabel={currentAction.confirmLabel}
          noteLabel={currentAction.noteLabel}
          notePlaceholder={currentAction.notePlaceholder}
          noteValue={currentAction.noteValue}
          onNoteChange={currentAction.onNoteChange}
        />
      ) : null}
    </div>
  );
}
