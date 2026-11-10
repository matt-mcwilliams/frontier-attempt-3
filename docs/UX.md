# Interface decisions

Margin prioritizes reading, asking a question, and reviewing learner work. The interface keeps its existing serif typography and green palette while removing competing introductions and decorative labels.

## Guidance applied

- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): use task-specific labels, keep status visible, remove irrelevant information, and preserve clear ways to close panels and recover from errors.
- [Nielsen Norman Group: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep frequent actions visible; reveal source metadata, import options, activity counts, and experimental teaching settings on request.

The lesson starts with the actual paper title, its authors and access level, and a visible start/sign-in action. Progress appears once a conversation exists. The research objective remains editable in Settings. Source provenance, abstracts, original links, PDFs, prerequisite return points, and evidence-linked learning records remain available.

## Model-specific criticism considered

These reports describe individual experiences and small comparisons, not controlled evidence of a universal model limitation:

- [GlanceHall's GPT-6.1 Sol interface comparison, October 22, 2026](https://glancehall.com/blog/best-ai-for/ai-ui-design) reports repeated layout/type choices and less considered finishing detail. Margin retains its own visual identity and uses a consistent control scale rather than adding a generic dashboard or extra cards.
- [A user's layout criticism](https://www.reddit.com/r/chatgptplus/comments/1xlbyuk/so_frustrated_and_looking_for_alternatives/) describes misalignment and disproportionate control heights. The browser checks cover narrow and desktop layouts, including whether the start action and message input fit in the viewport.
- [A user's feature-removal report](https://www.reddit.com/r/OpenaiCodex/comments/1wtli5j/first_impression_about_gpt61_sol/) describes losing a visual feature during optimization. This change removes promotional copy and duplicate context; secondary functionality is retained behind labeled controls. Existing source upload, persistence, themes, drafts, and camera tests remain part of verification.
- [Thomas Wiegold's web design test, October 5, 2026](https://thomas-wiegold.com/blog/gpt-6-1-sol-review/) criticizes minimal technical compliance and thin testing. This redesign is checked in rendered desktop, mobile, and dark-mode screenshots, alongside real local API and WebRTC tests. Extra animation or marketing sections would conflict with this app's reading task and the request to reduce distraction.

## Verification boundaries

`npm run test:e2e` uses an isolated temporary data directory and synthetic camera video. It checks the production UI, source import and provenance disclosure, saved drafts and themes, camera capture, settings disclosures, and layout at 320, 390, 1024, and 1360 pixels. It makes no live tutoring requests. See [VERIFICATION.md](VERIFICATION.md) for real-account and physical-device checks that still require manual validation.
