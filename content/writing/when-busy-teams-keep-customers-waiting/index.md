---
title: "Follow the work between teams"
description: "Follow the user's need through the service to a useful outcome."
seo_description: "Use value stream mapping and the customer perspective in STATIK to trace cross-team dependencies, waiting and unnecessary steps."
date: 2026-11-01T09:00:00+01:00
publishDate: 2026-11-01T09:00:00+01:00
draft: false
publication:
  status: "approved"
  reviewed_by: "Marc Gelpí"
  reviewed_at: "2026-10-11"
  privacy_reviewed: true
---

A user's journey can cross the whole organization while each team sees only its own part.

**Why it matters:** We can create departments that are easy to manage and leave users waiting between them. Completing an internal task says little about whether someone has received what they need.

**Start with the person receiving value:** We divide organizations by specialism, product or responsibility. Some boundaries reflect historical decisions or the convenience of internal management. Those divisions do not necessarily describe how users receive value.

When I use STATIK, I return to that reference point: who receives the value and what they expect. From there, we can examine each step, including those our organization takes for granted.

A receiving team needs usable information to continue. The person requesting the service needs an outcome. Both matter, but completing an internal handoff can leave that outcome unfinished.

{{< figure src="/writing/when-busy-teams-keep-customers-waiting/value-stream.png" alt="Four stages: user need, request, processing and useful response. The flow crosses internal boundaries. A return arrow represents asking for missing information." caption="Conceptual flow: 1. User need. 2. Request. 3. Processing and decision. 4. Useful response. The return shows an information request that creates a wait. Internal boundaries do not define the outcome the person needs." width="1536" height="1024" >}}

**DWP: prepare applications for decisions:** At the UK's Department for Work and Pensions (DWP), Digital designed the online Budgeting Loan application. Operations processed the applications. The system sent the information directly to the people processing it.

When necessary information was missing, Operations had to ask the applicant for it. Operations could make the decision only after receiving their reply. The return loop was the symptom: the service allowed someone to submit an application that staff could not yet resolve.

Digital and Operations [worked on that problem together](https://dwpdigital.blog.gov.uk/2016/04/05/apply-for-a-budgeting-loan-collaborating-with-operations/). They added mandatory questions and validation, and arranged the information on one page for processing. The team reported fewer calls and quicker decisions, without reporting a measure of the total time saved.

They also [challenged questions that repeated information already available](https://dwpdigital.blog.gov.uk/2015/12/18/budgeting-loans-focusing-on-user-needs/). In the prototype, they removed bank-detail questions because the department already held that information.

The collaboration changed the service design. Digital staff did not manually forward every application to Operations. For the user, submitting the form remained a step toward a response and, where applicable, the loan.

**Use the map to understand the system:** [Value Stream Mapping](https://www.lean.org/lexicon-terms/value-stream-mapping/) represents the current flow and helps people design a future state. [STATIK](https://kanban.university/kanban-guide/) examines dissatisfaction, demand and capability to design a Kanban system. Modeling the workflow is one of its steps.

To investigate this problem, we can use that shared perspective:

1. Define the recipient and outcome. Set the boundaries of the journey you will observe. For DWP, deciding on a loan and paying it are different endpoints.
2. Understand demand. What do people request, where does it arrive, and what disappoints them? Choose several representative requests.
3. Draw the actual route with the people doing the work. Include information, waits, decisions and returns, even when they cross teams.
4. Add evidence. Separate active work from waiting. Ask what each step contributes to the outcome and which safeguards we need to keep.
5. Design and test a better flow. Agree one change, its owner and how to check total time, quality and effort.

**Remove steps without moving the problem:** A user's perspective lets us question duplicate requests, redundant approvals or steps we no longer need. It also requires us to recognize [necessary supporting work](https://www.lean.org/the-lean-post/articles/helpful-hints-about-mapping-off-the-plant-floor-in-support-of-administrative-operations/). A check can protect quality or an obligation we must meet.

At DWP, a [later assessment](https://www.gov.uk/service-standard-reports/apply-for-a-budgeting-loan) warned that requesting less information could increase Operations' effort to match applications with existing records. An easier entry point could move work to the next stage.

Check the whole journey: the user's wait, errors and the effort required to resolve the request. Keep the same start and finish when comparing. A before-and-after improvement can guide learning without proving causation by itself.

The [Adevinta case](/work/adevinta/) includes a Kanban pilot in Talent Acquisition, alongside work on cross-team coordination.

Before improving a handoff between teams, ask what the person receiving value actually needs.

If people are waiting between your teams, [let's talk](/contact/) about one request and the outcome its recipient needs.
