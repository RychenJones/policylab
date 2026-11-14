# Policy Simulation Project Brief

## Project concept

We are building a hackathon MVP that simulates how proposed legislation could affect a population of 5,000 households.

A legislator enters policy changes—such as increasing the gas tax—and the simulator estimates how households might respond. For example, some households may switch to electric vehicles, reduce driving, or use public transportation more often.

The goal is to create a simple, understandable policy-testing tool that helps users explore potential consequences before implementing legislation.

This is an exploratory simulation, not a prediction engine. Its results should be clearly labeled as estimates based on simplified assumptions.

## MVP features

The first version should include:

1. Generate or load 5,000 simulated households.
2. Assign each household randomized characteristics, such as:
   - Annual income
   - Number of household members
   - Number of vehicles
   - Current vehicle type
   - Annual miles driven
   - Sensitivity to transportation costs
   - Ability or willingness to switch transportation methods
3. Allow the user to configure three policy variables:
   - Electric vehicle rebate
   - Gas tax
   - Public transportation cost
4. Run the simulation.
5. Estimate household responses, including:
   - Continuing to drive a gas-powered vehicle
   - Switching to an electric vehicle
   - Reducing vehicle usage
   - Switching partially or fully to public transportation
6. Display results through simple charts and summary statistics.

## Example simulation flow

A legislator sets:

- Gas tax: `$1.00 per gallon`
- EV rebate: `$7,500`
- Public transportation cost: `$2.50 per ride`

The simulation then:

1. Generates or loads 5,000 households.
2. Calculates the transportation cost impact on each household.
3. Determines whether each household is likely to:
   - Keep using a gas-powered vehicle
   - Purchase or switch to an EV
   - Use public transportation
   - Reduce driving
4. Summarizes the population-level results.
5. Displays the effects in charts and readable explanations.

## Suggested MVP assumptions

To keep the project achievable in one day:

- Use a rule-based model rather than machine learning.
- Generate synthetic households using randomized but reasonable ranges.
- Use a fixed random seed during development so results are reproducible.
- Model each household independently.
- Use simplified thresholds or scoring formulas.
- Avoid attempting to model every real-world factor.
- Clearly communicate that the results are hypothetical.

For example:

```text
If increased annual gas costs exceed a household's transportation budget,
the household becomes more likely to switch behavior.

If the EV rebate reduces the estimated EV purchase cost below the household's
affordability threshold, the household becomes more likely to switch to an EV.

If public transportation is affordable and available, the household becomes
more likely to use public transportation.
```

## Team structure

### Backend Engineer 1: Household generation

Responsibilities:

- Define the household data model.
- Generate 5,000 synthetic households.
- Create randomized demographic and transportation variables.
- Ensure generated data is realistic enough for the simulation.
- Provide sample data for frontend development.

### Backend Engineer 2: Simulation algorithm

Responsibilities:

- Implement the policy input model.
- Calculate policy effects for each household.
- Define household response rules.
- Produce aggregate results.
- Expose the simulation through a function or API.

Suggested output fields:

- Number of households remaining with gas vehicles
- Number switching to EVs
- Number switching to public transportation
- Number reducing driving
- Average household cost change
- Total estimated emissions change
- Results grouped by income level

### Frontend Developer 1: Policy input interface

Responsibilities:

- Build the legislator-facing input screen.
- Add controls for:
  - Gas tax
  - EV rebate
  - Public transportation cost
- Add a “Run Simulation” button.
- Validate input values.
- Display loading, error, and completion states.
- Send inputs to the backend simulation.

### Frontend Developer 2: Results interface

Responsibilities:

- Build the results dashboard.
- Display summary cards.
- Create charts such as:
  - Transportation behavior before and after policy
  - EV adoption by income group
  - Average household cost change
  - Public transportation adoption
  - Estimated emissions change
- Make the output understandable to a nontechnical user.
- Include a short explanation of the simulation assumptions.

## One-day implementation plan

### Phase 1: Planning and setup

- Agree on the household data structure.
- Agree on the policy input format.
- Agree on the simulation output format.
- Choose the frontend/backend integration method.
- Create a shared repository structure.

### Phase 2: Parallel development

Backend engineers work on household generation and simulation logic.

One frontend developer builds the policy input screen.

The other frontend developer builds the results dashboard using mock data.

### Phase 3: Integration

- Connect the input form to the simulation.
- Connect simulation results to the dashboard.
- Verify that the same data format is used across all components.
- Test several policy scenarios.

### Phase 4: Polish

- Improve chart labels and explanations.
- Add sensible default values.
- Add error handling.
- Add a short “How this works” section.
- Prepare a concise demonstration scenario.

## Definition of success

The MVP is successful if a user can:

1. Open the application.
2. Enter values for the gas tax, EV rebate, and public transportation cost.
3. Run a simulation of 5,000 households.
4. See how many households change transportation behavior.
5. Understand the financial and environmental effects.
6. Compare different policy scenarios.

## Future enhancements

If time allows, the team could add:

- Side-by-side comparison of two policies
- Adjustable population size
- More detailed household demographics
- Geographic differences in public transportation availability
- Different vehicle prices and fuel efficiencies
- Household-level drill-down
- Confidence ranges or uncertainty estimates
- Historical policy comparison
- Emissions and tax-revenue calculations
- Saved simulations
- More sophisticated behavioral or economic models
- Machine learning based on real-world transportation data

## Prompt for the workload-planning agent

```text
You are a technical project manager helping divide a one-day hackathon project among four developers.

Project:
We are building an MVP policy simulation tool that models 5,000 synthetic households. A legislator can enter three policy variables:

1. Electric vehicle rebate
2. Gas tax
3. Public transportation cost

The simulator estimates how households respond to those policies. Possible responses include continuing to use a gas-powered vehicle, switching to an electric vehicle, reducing driving, or using public transportation.

The first version should use randomized synthetic household data and a simple rule-based algorithm. It is an exploratory simulation, not a real-world prediction engine.

Household variables may include:

- Annual income
- Number of household members
- Number of vehicles
- Current vehicle type
- Annual miles driven
- Fuel usage
- Transportation budget
- Sensitivity to cost changes
- Ability to switch to public transportation
- Likelihood of purchasing an EV

The application needs:

- A policy input interface
- Backend household generation
- Backend simulation logic
- A results dashboard
- Charts and summary statistics
- Clear explanations of assumptions

Team members:

- Backend Engineer 1
- Backend Engineer 2
- Frontend Developer 1: input interface
- Frontend Developer 2: output dashboard

Please divide the work into four clearly defined, parallelizable workstreams.

For each workstream, provide:

1. A concise objective
2. Detailed responsibilities
3. Files or modules to create
4. Interfaces or data contracts with the other workstreams
5. Acceptance criteria
6. A suggested implementation order
7. Potential risks or blockers
8. A minimal version that can be completed quickly
9. Optional stretch goals if the team finishes early

Also provide:

- A recommended shared household data schema
- A recommended policy input schema
- A recommended simulation output schema
- A one-day timeline divided into phases
- Integration checkpoints
- A testing strategy
- A list of decisions the team should make before coding
- A demo scenario for presenting the project

Prioritize simplicity, parallel development, clear interfaces, and a working demo over sophistication. Make reasonable assumptions instead of overengineering the MVP.
```

## Recommended coordination rule

Have the team agree on the shared data schemas before coding. This will prevent the backend and frontend developers from building incompatible pieces.
