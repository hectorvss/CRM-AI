/**
 * Shared primitives — barrel for cross-module modals/drawers/CTAs.
 */
export { ShareModal }            from './ShareModal';
export { SubscribeModal }        from './SubscribeModal';
export { ActivityLogDrawer }     from './ActivityLogDrawer';
export type { ActivityScope }    from './ActivityLogDrawer';
export { EmptyStateCTA }         from './EmptyStateCTA';
export type { ProductKind }      from './EmptyStateCTA';

// Per-module primitives (re-exported here for one-import wiring from Prototype.tsx)
export { ReplayTabs }            from '../session-replay/ReplayTabs';
export { MobileHeatmaps }        from '../heatmaps/MobileHeatmaps';
export { NotebookCollab }        from '../notebooks/NotebookCollab';
export { SavedMetricsModal, VariantsHoldoutsEditor } from '../experiments/ExperimentExtras';
export { SymbolUploadModal }     from '../error-tracking/SymbolUploadModal';
export { CostDashboardTile }     from '../llm-analytics/CostDashboardTile';
export { ReleaseToggle }         from '../feature-flags/ReleaseToggle';
export { ScheduleSyncDrawer }    from '../data-warehouse/ScheduleSyncDrawer';
export { BranchingEditor }       from '../surveys/BranchingEditor';
