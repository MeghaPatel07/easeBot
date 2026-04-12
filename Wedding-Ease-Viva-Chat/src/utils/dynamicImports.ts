import { lazy } from 'react';

export const LazyBudgetDashboard = lazy(
  () => import('../components/BudgetDashboard')
);

export const LazyShoppingListView = lazy(
  () => import('../components/ShoppingListView')
);

export const LazyTimelineView = lazy(
  () => import('../components/TimelineView')
);

export const LazyProgressDashboard = lazy(
  () => import('../components/ProgressDashboard')
);

export const LazyComparisonTable = lazy(
  () => import('../components/ComparisonTable')
);

export const LazyGalleryView = lazy(
  () => import('../components/GalleryView')
);

export const LazyChecklistDetail = lazy(
  () => import('../components/ChecklistDetail')
);

export const LazySettingsModal = lazy(() =>
  import('../components/SettingsModal').then((mod) => ({
    default: mod.SettingsModal,
  }))
);
