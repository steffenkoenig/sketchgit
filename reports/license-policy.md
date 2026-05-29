# License Policy

This document outlines the license policy for the SketchGit project dependencies.

## Allowed Licenses

The following licenses are considered compatible with the SketchGit project and are permitted for production dependencies:

- MIT
- ISC
- BSD-2-Clause
- BSD-3-Clause
- Apache-2.0
- CC0-1.0
- Unlicense
- 0BSD
- LGPL-2.1
- LGPL-3.0-or-later
- BlueOak-1.0.0
- MPL-2.0
- Python-2.0
- CC-BY-4.0

## Blocked Licenses

The following copyleft and restrictive licenses are explicitly blocked from being used as production dependencies without prior legal review:

- GPL-2.0
- GPL-3.0
- AGPL-3.0
- SSPL-1.0
- BUSL-1.1

## Exception Process

Any dependency with a license not listed in the "Allowed Licenses" section must be reviewed before inclusion. If approved, the local script and CI configuration (`.github/workflows/ci.yml`) must be updated to include the new allowed license.
