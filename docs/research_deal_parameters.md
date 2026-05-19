# Research Analysis: Synthetic B2B Deal Unit

This dataset treats a deal as a CRM opportunity plus qualification state, buying-committee context, activity history, commercial terms, approval workflow, and forecast governance.

## Sources Used

- Salesforce Opportunity object fields: amount, close date, stage, type, probability, forecast category, next step, owner, account.
- HubSpot default deal properties: amount, close date, create date, deal stage, pipeline, deal type, forecast amount/category, activity dates.
- Gartner B2B buying journey research: buying groups, multi-stakeholder consensus, decision process complexity.
- MEDDIC/MEDDPICC sales qualification: metrics, economic buyer, decision criteria, decision process, paper process, identify pain, champion, competition.
- Sales forecasting and win-propensity literature: opportunity stage, opportunity history, sales activity, opportunity size, historical win rates, and pipeline movement as predictive inputs.
- Professional revenue operations practice from pipeline inspection tools: stale activity, next steps, slipped deals, legal/security/procurement blockers, and forecast deltas.

## Included User-Provided Parameters

All 40 requested variables are included in `synthetic_deals` either as scalar columns or JSONB:

1. Opportunity ID
2. Account name
3. Deal amount / ARR
4. Deal type
5. Product line
6. CRM stage
7. Forecast category
8. Rep-stated probability
9. CRM model probability
10. Historical win rate for similar deals
11. Close date
12. Days to close
13. Original close date
14. Close date change count
15. Stage age
16. Last activity date
17. Next step quality
18. Mutual action plan status
19. Champion strength
20. Economic buyer identified
21. Executive sponsor engaged
22. Buyer stakeholder map
23. Decision process clarity
24. Decision criteria known
25. Compelling event
26. Budget confirmed
27. Procurement status
28. Legal status
29. Security review status
30. Compliance requirements
31. Implementation complexity
32. Integration requirements
33. Discount requested
34. Payment terms requested
35. Competitor present
36. Incumbent vendor status
37. Account segment
38. Region / territory
39. Account team members
40. Sensitive deal flag

## Additional Parameters

The generator adds more than 30 fields beyond the requested 40, including:

- Industry / vertical
- Employee count
- Annual revenue band
- Existing customer flag
- Account health score
- Lead source
- Partner-sourced flag
- Sales cycle age
- Stage regression count
- Prior slipped-quarter count
- Activity count last 14 days
- Executive meeting completed
- Buying-committee contact count
- Active detractor count
- Champion seniority
- Champion responsiveness
- Business pain severity
- Quantified value / ROI present
- Urgency score
- Budget owner identified
- Contract paper type
- Data residency requirement
- SSO / SAML requirement
- InfoSec questionnaire length
- Pilot completed flag
- Pilot success score
- Implementation start-date dependency
- Required discount approval level
- Multi-year term requested
- Competitive displacement difficulty
- Renewal date proximity
- Product usage signal
- Prior support escalations
- Reference call completed
- Buyer sentiment score

## Modeling Principles

- Features are correlated, not independently random.
- Later-stage deals have more legal, procurement, security, and paper-process data.
- Enterprise and strategic deals have larger buying committees, longer cycles, more approvals, and higher implementation complexity.
- Expansion and renewal deals are more likely to have account health, product usage, renewal proximity, and support-escalation data.
- Missingness is intentional and sometimes predictive.
- Outcomes are sampled from latent probabilities so no field, model, or agent can know a result with certainty.

## Leakage Boundary

Observable feature rows never include hidden labels or latent probabilities. Labels and latent drivers live only in `synthetic_deal_outcomes`. Practice Run live rows include public observable features and baseline predictions, but not hidden outcomes.
