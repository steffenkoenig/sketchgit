fix: cancel lock-expire timers and fix lint error

This commit addresses BUG-008 by explicitly cancelling lock-expire
timers on CollaborationManager destroy. It also adds unit tests.
Additionally, it resolves a linting issue in ErrorFallback.
