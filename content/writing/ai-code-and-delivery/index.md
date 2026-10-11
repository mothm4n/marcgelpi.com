---
title: "More code can stall delivery"
description: "What to measure and test when AI accelerates coding and work accumulates in review."
date: 2026-10-25T09:00:00+01:00
publishDate: 2026-10-25T09:00:00+01:00
draft: false
publication:
  status: "approved"
  reviewed_by: "Marc Gelpí"
  reviewed_at: "2026-10-11"
  privacy_reviewed: true
---

Companies in the study produced **30% more code** with artificial intelligence (AI) agents, while the review process took **49% longer**. [Chen and Stratton's study](https://fion.ac/jellyfish.pdf).

**Why it matters:** Users care about changes that help them do what they need in the product. AI can accelerate one stage, but the team must manage the whole process until users receive that improvement.

**What the two sources show:** [Ars Technica](https://arstechnica.com/ai/2026/10/ai-coding-agents-generate-more-code-but-not-more-software/) reports on research by Fiona Chen and James Stratton. Both sources cover the same study.

The authors analysed data from around **700 companies and 700,000 workers**, from January 2021 to March 2026. For agents that perform tasks with some autonomy, they report:

- **23% more pull requests**, which submit code for review and integration.
- No statistically significant increase in tasks or initiatives completed in Jira.
- No statistically significant employment change attributable to AI.

The **49%** measures the time from submitting a change to merging it, including waiting. The share of pull requests needing corrections almost doubles. [Study results and measures](https://fion.ac/jellyfish.pdf).

Completed Jira tasks approximate software output. They do not directly measure value for users. A statistically insignificant result does not prove that the effect is zero.

This observational study compares companies that adopted the tools at different times. Its estimates depend on assumptions, and the data ends in March 2026. [Method and scope](https://fion.ac/jellyfish.pdf).

**How the team can finish together:** More coding capacity requires the team to reconsider how it works together to finish changes.

Imagine a team that finishes coding earlier and starts new tasks while other changes wait for review. Each person can look more productive while users still wait. This is a hypothetical example of the risk.

If managers reward starting work and counting activity, helping with reviews can seem like a lesser contribution. Reviewers face more pressure and may take the blame for a queue the whole team feeds.

The team can make the waits visible and agree how to share the work to finish. **Everyone attacks and everyone defends:** coding, reviewing and testing are part of the team's shared responsibility for delivery.

Each person contributes their expertise and helps with other tasks when they have the necessary knowledge or support.

Ask what each change needs to progress. The team may lack capacity, product knowledge or clarity about expectations. Blaming the reviewer makes that harder to identify.

**What to try with the team:** I suggest a two-week experiment.

1. Choose a common change and the user's task it should improve. Record delivery time, time waiting for review and defects after delivery.
2. Limit work in progress (WIP) through to delivery. Include agent-generated changes that still need review or testing.
3. At the WIP limit, you need to finish work before starting another task. If changes accumulate in review, agree who can help and what support they need.
4. Compare results with similar earlier changes and check whether users receive the intended improvement. Check the workload of the people reviewing the code too.

AI can help prepare tests or explain a change. The team needs to check whether that help reduces total effort and preserves quality.

Comparing results before and after the experiment can guide learning without establishing what caused the difference. Use the evidence to keep or adjust your agreement.

At your next retrospective, bring a change that is still waiting for review. **Agree how to finish it and what improvement users should receive.**
