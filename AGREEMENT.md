# Founders' Agreement

Project: Dana  
Parties: Hassan and Imran  
Start date: 2026-07-29

## 1\. What This Is

This is simply a working agreement between two people building a product together. It is not a company or a formal legal contract. It is here so we are both clear on what we agreed to, what we expect from each other, and how we protect our time outside the project. It is not about distrust. We are simply putting things in writing so nothing important is left to assumptions.

This agreement gives us a common understanding of how we work together, what each of us is responsible for, how we make decisions, and what we can reasonably expect from each other. We both consider ourselves partners and owners of Dana and are building the project together.

## 2\. What Each of Us Wants Out of This Project

Imran: For Imran, the goal is to found and be part of building a productivity platform that people can rely on for organizing work, projects, tasks, and workflows. Imran also sees this as a learning experience in building a real product from an idea to implementation and eventually putting it in the hands of real users, while learning how to make decisions, collaborate, and understand the challenges, struggles, and hardships involved in turning a small idea into a serious platform.

Imran also has a larger vision of developing Dana into a new kind of productivity platform that helps people maximize their productivity and becomes a stronger alternative in this space than a normal chatbot, a traditional to-do app, or a broad open-ended platform. If developed properly toward that vision, Imran believes that the experience and knowledge gained could help us earn a meaningful place in the future of AI and technology, whether through Dana or a future project.

Hassan: For Hassan, the goal is to implement technical solutions to real-world problems that real people face, while learning how startups actually work through collaboration, ownership, scope, shipping, and iteration. He is not particularly concerned with the financial side, marketing, revenue, or the scale the product eventually reaches. What matters to him is building something technically meaningful that genuinely solves a problem, while building solid knowledge capital and, most importantly, developing a practical understanding of how startups work that he can carry into future projects.

If even ten people use the product every day and genuinely rely on it, Hassan would consider that a huge success. The number itself is not what matters. If the technical work is genuinely solving a real problem for real people, even on a small scale, that is enough.

## 3\. Our Roles

We have different areas where each person naturally takes the lead, but these roles are not rigid boundaries. We can help, criticize, recommend, suggest, raise concerns, consult with each other, assign tasks when needed, and share responsibilities through mutual understanding and basic human decency.

### Imran's Role

Imran primarily leads the overall direction of the project, its finances, and the broader vision we are trying to implement.

Overall project trajectory: Imran has authority over what the product becomes and how the project progresses. He decides which features to add or remove, what should be worked on, and in what order. He may request new features, changes, or other work at any time.

If a request creates significant technical difficulty or requires substantial engineering time or resources, Hassan will explain the technical implications and provide an estimate of the required effort, time, and cost. Imran then decides whether the additional investment is worthwhile. If he chooses to proceed, Hassan is responsible for implementing the feature to the best of his technical ability.

Finances: Financing is primarily Imran's responsibility. Any money he spends on the project is considered part of his contribution. There is no need for a shared project expense ledger except for agreed-upon recurring monthly payments. Imran may keep his own record of expenses for financial organization if he wishes.

Imran has full autonomy over financial decisions and is not obligated to purchase something simply because Hassan believes it is needed. He decides what to fund, whether to purchase or renew a service, and whether to cancel or discontinue an expense.

UI and UX: Imran leads everything related to what the user sees and experiences. For each feature he requests, he is responsible for providing a sufficiently clear, non-technical description and, where appropriate, the corresponding UI/UX prototype. This includes design direction, branding, visual language, colors, animations, spacing, layouts, and how the application looks and behaves across mobile, web, and desktop.

## 4\. Hassan's Role

Hassan leads the technical side of the project, from architecting how a feature should work technically to implementing that architecture in code and maintaining the resulting system. Hassan is also responsible for maintaining appropriate technical documentation and helping ensure that the product implementation follows consistent and standardized engineering practices.

Technical design: Hassan is responsible for designing the technical structure required to support each requested feature. This includes backend architecture, APIs, database structure and data models, pipelines, systems, workflows, integrations, security, and other technical components.

The purpose of this phase is to determine how the different parts of the system should be structured and how they should work together before the design is implemented. Hassan is also responsible for identifying technical constraints, dependencies, edge cases, and potential problems during this process.

Technical implementation: Once the technical direction is defined and the UI/UX is sufficiently clear, Hassan is responsible for turning that design into working code. This means building the required backend and supporting systems, connecting Imran's frontend work to them, integrating the components, and making the feature function as intended. This also includes testing, error handling, deployment, and maintaining the reliability of the system.

Technical decisions: Hassan has final authority over technical decisions made throughout both the design and implementation of the project. This includes decisions about architecture, tools, technologies, algorithms, methods, and engineering approaches.

Imran may provide suggestions or raise concerns, but the technical approach remains Hassan's responsibility. Where a technical decision has a significant impact on effort, time, financial cost, or the feasibility of a feature, Hassan is responsible for explaining those implications so Imran can make an informed decision about whether to proceed.

Hassan is also responsible for trying to find the most practical and optimal technical approaches and for designing foundations that are broad and flexible enough that the product does not become unnecessarily constrained by early technical decisions.

## 5\. Working Boundaries

This section defines how we work within our respective domains. The goal is to avoid interrupting each other's work, creating unnecessary conflicts, or stepping outside our responsibilities in a way that creates confusion or unnecessary work for the other partner.

The main rule is to respect each other's boundaries and responsibilities and not interfere in a way that creates unnecessary mess or headaches for the other person.

If either of us notices a problem outside our own domain, the normal approach is to report the problem through a GitHub issue so the person responsible can review and resolve it. The person who identifies the problem should not normally open a pull request, commit a fix, or modify the relevant files themselves unless there is a clear reason, permission, or mutual understanding for doing so.

A CODEOWNERS file will be maintained in the root of the repository to clearly define which directories and areas primarily belong to each person. However, Imran does not push directly to the main branch.

This separation is intentional because a second pair of eyes can catch problems that the person working on something may not notice, so reporting issues is valuable. However, when we both begin modifying the same work without coordination, we can end up working in the same files, reviewing unnecessary changes, and interrupting each other's workflow.

Keeping the work reasonably separated allows both of us to stay focused on our own responsibilities while still helping and reviewing each other when needed.

## 6\. Workflow and Feature Requests

Our workflow can continue evolving as Dana and our experience grow.

If something was not fully specified beforehand, we can discuss it during development and make a mutual decision instead of treating the original specification as rigid.

The amount of explanation and documentation required should also depend on the size and complexity of the feature. A small feature should not require unnecessary documentation just for the sake of following a process.

### Feature Requests

A feature request should be sufficiently explained before work begins. Simply saying, "I want an xyz feature," without enough information to understand the expected behavior is usually not enough.

Where possible, the feature should be explained through a working or simulated frontend prototype so the intended user behavior can be clearly seen and acted upon.

The feature request should be understandable to a human without requiring technical knowledge. It should not rely heavily on technical language, generic wording, AI one-liner slop, or subjective descriptions such as "it should feel good" or "it should look modern."

For significant features, once the product direction is sufficiently clear, Hassan can turn it into a technical RFC based on the current codebase. The RFC defines how the feature can actually be implemented, identifies missing information or ambiguities, and addresses technical constraints, dependencies, and potential edge cases.

Imran should therefore not only ask for features to be added. Where reasonably possible, the feature should be demonstrated through a prototype with simulated frontend behavior and supported by an `.md` file containing the important related decisions needed for technical implementation.

For small or straightforward features, a prototype, issue, short explanation, or mutual discussion may be enough.

Once Hassan has provided the relevant technical information, Imran decides whether the feature is worth the required time, effort, and financial cost.

## 7\. Time Commitment

There are no minimum required hours. This is a serious side project, but not necessarily a full-time job, and we both have studies, work, families, and lives outside of it.

Commitment is measured by the scope we agree to take on, not by the number of hours we spend working. We each complete our responsibilities on our own schedule.

The basic expectation is simple human decency: communication and consideration for each other. We commit to responding to the other person within approximately 72 hours, even if the response is simply, "I can't get to this this week." A quicker response is always appreciated from both sides when possible.

If someone's circumstances temporarily prevent them from contributing, the other person gives them the necessary time and does not pressure them to work during that period. However, the person should clearly communicate their unavailability, whether it is due to exams, work, personal circumstances, or another significant life event.

These periods can be treated as temporary blackout periods during which no work is expected. If both agree and the person still wants to help reach an important milestone, some responsibilities may be adjusted, reassigned, or accommodated accordingly.

Either person can declare such a period when necessary, and the other person agrees to respect it without arguing or applying unnecessary pressure.

## 8\. Ownership and Partnership

Dana is a project founded and built together by Imran and Hassan, and we consider ourselves equal partners in the project.

This reflects the fact that we contribute different but important parts of the project and depend on each other's work to build Dana properly. Our contribution is not measured by the number of hours worked, commits made, or individual tasks completed, but by the overall responsibilities and value each of us brings to the project.

Neither of us should make decisions about transferring, giving away, selling, or promising any part of Dana's ownership to another person without discussing it and agreeing together.

For now, we do not need detailed rules about vesting, investors, dilution, departure percentages, or other corporate matters that we cannot meaningfully track at this stage. If Dana reaches a stage where we incorporate the project, raise investment, generate significant revenue, or otherwise need formal ownership arrangements, we will discuss those matters together and create the appropriate agreement at that time.

For the purpose of this agreement, nothing changes the understanding that Imran and Hassan are equal partners in the project unless one person explicitly states that they no longer wish to be part of Dana.

If one person stops contributing and does not respond regarding their responsibilities for more than one month, without communicating a valid reason or temporary period of unavailability, the other person may reasonably consider that they have stepped away from active participation in the project. If this situation ever occurs, both sides should first make a reasonable effort to communicate and clarify the situation before making any further decisions.

## 9\. Ownership of Work

Everything either of us produces specifically for Dana is considered part of the project and belongs to Dana as a jointly built project. This includes code, pipelines, systems, architecture, specifications, documentation, designs, prototypes, branding, domain names, and project accounts.

If either person later leaves the project, they cannot restrict Dana from continuing to use the work they contributed while they were part of it.

Neither of us should directly copy or reuse Dana's specific proprietary code, private systems, project assets, or other uniquely developed work in another competing product without discussing it with the other person.

However, reusing general knowledge, experience, skills, development methods, design knowledge, technical understanding, or lessons learned from Dana in other projects, including potentially competing projects, is completely fine and expected.

A LICENSE file may be maintained in the repository where necessary to document the project's ownership and usage terms more clearly.

## 10\. Agreement

We have both read this document, we both understand it, and we both agree to it.

We are not expecting perfection from each other.

We are committing to communicate, contribute, learn, solve problems together, respect each other's work, and give Dana a serious opportunity to become something useful.

We also agree that our work and major decisions should remain within Islamic moral principles. We will not knowingly build the project around something that we believe is clearly prohibited or unethical according to those principles.

If we have a serious disagreement regarding whether an important decision, investment, contract, revenue model, partnership, or other major matter follows those principles, we should first try to resolve it together. If we cannot reach an understanding, we can seek guidance from a qualified and mutually trusted knowledgeable authority and use that guidance as the final reference for the matter.

We hereby confirm and acknowledge this document as duly signed.

**Hassan Shahir**  
**Imranullah Wafa**

