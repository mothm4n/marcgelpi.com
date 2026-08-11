# V0 information-density report

Measured against production builds in Chromium. Full-page review captures were taken at 390×844 and 1440×1000 for Home, Work, About, Contact, and the Adevinta case.

## Mobile — 390×844

| Journey | Before height | Before screenfuls | After height | After screenfuls | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home | 4,692 px | 5.56 | 4,267 px | 5.06 | −425 px / −0.50 |
| Work | 1,704 px | 2.02 | 1,474 px | 1.75 | −230 px / −0.27 |
| About | 7,044 px | 8.35 | 6,152 px | 7.29 | −892 px / −1.06 |
| Contact | 2,166 px | 2.57 | 2,146 px | 2.54 | −20 px / −0.03 |
| Adevinta case | 4,867 px | 5.77 | 4,294 px | 5.09 | −573 px / −0.68 |

The Adevinta after measurement includes the new contextual conversation CTA. About also includes its new conversation CTA. Work and Contact remain shorter than their recorded mobile baselines.

## Desktop — 1440×1000

| Journey | Before height | Before screenfuls | After height | After screenfuls | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home | 4,008 px | 4.01 | 4,008 px | 4.01 | 0 px / 0.00 |
| Work | 1,713 px | 1.71 | 1,713 px | 1.71 | 0 px / 0.00 |
| About | 6,118 px | 6.12 | 6,651 px | 6.65 | +533 px / +0.53 |
| Contact | 2,192 px | 2.19 | 2,187 px | 2.19 | −5 px / 0.00 |
| Adevinta case | 4,186 px | 4.19 | 4,720 px | 4.72 | +534 px / +0.53 |

The desktop increases on About and Adevinta are the space required by the approved CTA content introduced in issues #14 and #15. Existing content was not removed or rewritten to reach the density targets.

## Review notes

- Mobile image allocation was reduced while preserving responsive sources, explicit dimensions, useful alternatives, and meaningful crops.
- Mobile case stages place the number beside the scope label so headings and evidence use the full readable width.
- Body copy remains at its existing readable size. Acceptance coverage limits primary desktop measures to 80 characters and body line height to 1.5–2.
- Automated browser coverage checks every public V0 route at 320 px, 390 px, and 1440 px, including WCAG text-spacing overrides and page-level overflow.
- Representative before/after screenshots were reviewed from `output/quality/before/` and `output/quality/after/`.
