# Chapter 1 Introduction

## 1.1 Background
Manufacturing lines are cyber-physical systems: machines transform material while sensors, controllers, operators, and enterprise applications record and influence that work. A digital twin gives a defined manufacturing element a digital representation that is synchronized with information about the element. In manufacturing, the element may be a machine, product, process, facility, or another observable entity. The representation is useful only when its scope, data, models, and intended decisions are made explicit. The NIST and ISO literature therefore treats a twin as a fit-for-purpose engineering system rather than a three-dimensional picture or a generic dashboard [1], [2].

Small production cells provide a practical setting for studying the design questions behind a twin. Even a short line can contain several data and coordination problems: machine telemetry has different meanings at each station; repeated messages can arrive after a retry; a downstream process cannot work without upstream material; a buffer can fill and stop an upstream station; a defect detected at inspection may have originated earlier; and an operator may need to compare an intervention with the current operating plan. These concerns connect communication, state management, physical modeling, production flow, quality, and decision support.

This project develops a software prototype for a discrete five-station automotive-component manufacturing line. The line contains Stamping, CNC machining, Welding, Inspection, and Packaging. Its command center combines a seeded reduced-order causal simulator, a message event pathway, persistent Live Twin records, a process-level graph and token history, isolated what-if scenarios, versioned APIs, and a React dashboard. The models are explicit enough to demonstrate causal relationships and flow constraints, while remaining small enough to run as a local development application.

[[FIGURE:architecture]]

## 1.2 Industrial problem context
Machine-level telemetry does not by itself provide a line-level explanation. A vibration warning at a machining center may matter because it changes quality, effective cycle time, or the timing of work reaching Welding. A fault at one station can cause another to starve, while a blocked upstream buffer may prevent further production. A dashboard that shows five independent cards misses those dependencies. A line twin must therefore preserve machine state while also representing process order, buffers, parts, inspection outcomes, and relationships among stations.

The prototype addresses this gap by separating physical observations from the services that consume them. The simulator emits timestamped telemetry and event envelopes. The Live Twin reducer validates the envelope, records the actual receive time, rejects invalid state transitions, tracks event ordering, and persists the latest state. The Process Twin composes station twins into a directed acyclic graph and carries production tokens through that order. Scenario runs fork from a frozen snapshot and evaluate baseline and overridden models independently. This separation enables a user to inspect the current simulated line, review traceable parts, and compare a proposed scenario without rewriting the live twin.

## 1.3 Problem statement
The engineering problem is to design and implement a maintainable Industrial IoT command center that represents a multi-station manufacturing line at both the machine and process levels. The system must accept versioned telemetry, preserve a consistent current state when events are duplicated or late, make material-flow constraints visible, support traceable discrete production tokens, and permit reproducible counterfactual simulation from a captured state. It must also present these functions through a usable web interface and be deployable with common container orchestration tools.

The project does not claim a production installation or a validated physical plant model. The repository implements a simulator-backed prototype, with repository adapters and deployment manifests intended to support development and integration. It provides a concrete software foundation and testable invariants, but does not provide sensor calibration, shop-floor commissioning, or measured factory performance data.

## 1.4 Aim and objectives
The aim is to design and implement a digital twin orchestration platform for an Industrial IoT manufacturing line that joins telemetry, causal simulation, process-flow state, scenario comparison, and operational visualization.

The specific objectives are to define stable, versioned contracts for event and twin data; implement deterministic, station-specific reduced-order causal models; separate simulator output from Live Twin state reduction; measure event timing from observed timestamps; implement idempotent and monotonic event processing; represent production order through a directed acyclic graph; enforce upstream starvation and downstream buffer blocking; preserve part lineage and quality flags through a production token; run baseline and counterfactual scenarios from the same frozen snapshot; expose the platform through versioned REST interfaces; provide live status and analysis in the dashboard; and package the application for local, Docker Compose, and Kubernetes deployment.

## 1.5 Research questions
The project is guided by four design questions. First, how can a small manufacturing twin combine machine-specific causal models with one stable telemetry contract? Second, how can a state reducer retain audit history while preventing duplicate or late events from rolling current state backward? Third, how can line-level material constraints and part lineage be added without allowing a scenario simulation to mutate the live twin? Fourth, how can implementation claims be evaluated transparently when a repository contains simulator tests but no calibrated physical-line data or recorded performance benchmark?

The questions are architectural and engineering questions. They do not ask whether the prototype increases production or predicts physical failures in a real factory. Those claims require real equipment, calibrated models, a controlled evaluation, and evidence outside the current repository. The evaluation in this thesis consequently focuses on implemented behavior, contract validation, deterministic replay, flow invariants, scenario isolation, build evidence, and the boundary between observed and unevaluated performance.

## 1.6 Scope
The system models five station types and a sequential material path: STAMPING-01, CNC-01, WELDING-01, INSPECTION-01, and PACKAGING-01. The backend is written in Python and exposes FastAPI routes. Pydantic contracts define station events and twin records. The simulator includes station-specific degradation and telemetry. MQTT provides an asynchronous transport path, MongoDB is the durable repository option, and a thread-safe in-memory repository supports local development. The frontend is a React and TypeScript application with live polling, process views, telemetry, scenario controls, event records, and system status.

Scope includes scenario presets, deterministic seeds, snapshot-based execution, basic fault and maintenance commands, throughput and bottleneck summaries, quality-oriented token flags, container images, Docker Compose, and Kubernetes manifests. The models derive electrical energy from modeled current and a fixed assumed supply, and derive machine responses from reduced-order equations and seeded noise. The project supports a simulator-backed dashboard and an API path for adapter events; it does not include a certified device driver or a commissioned physical machine.

## 1.7 Significance
The engineering value of the prototype is in its explicit boundaries. A simulator does not directly overwrite a twin; the reducer owns the current state. A scenario does not run against mutable live objects; it forks from an immutable snapshot. A production line is not treated as five unrelated counters; it includes ordered material movement, queue limits, starvation, blocking, and tokens. Latency is not filled with randomized values; timing values are calculated when corresponding timestamps are available. These decisions improve traceability and make later validation easier.

The same boundaries are useful in teaching and in early-stage system integration. They give a team separable work packages: device and broker integration, data contracts, persistence, model calibration, operational analytics, front-end interaction, and deployment. Because the simulator and service interfaces are decoupled, an industrial adapter can be introduced later while retaining the same reducer and dashboard contracts, subject to field mapping and safety review.

## 1.8 Assumptions and limitations
The five stations and their nominal cycle times are illustrative model configuration. The simulator's mathematical coefficients are calibration-ready prototype parameters. They are not claimed to match a particular plant or machine. The line is modeled as a single sequential path with a maximum inter-station buffer of five units. The code's base model uses seeded pseudo-random variation for repeatability, not a probability distribution fitted from field data. Model-state labels and fault responses represent software behavior rather than a safety-rated machine control system.

The repository records a verification log, but the thesis does not equate unit tests with physical fidelity. No measured end-to-end latency percentiles, concurrency limits, uptime figures, energy savings, or prediction accuracy figures are available in the examined project material. The optional AI reasoning integration is not required for the core twin and is gated when its provider is unavailable. The current Mosquitto example configuration permits anonymous connections and must be hardened before connection to a real production network.

## 1.9 Contributions
The project contributes a reusable event envelope and strict data contracts; five station-specific deterministic models; an event reducer that handles event identity, sequence order, receive time, and idempotent persistence; a process twin that captures snapshots, analyzes bottlenecks, traces token flags, and enforces the sequential-line constraint; a scenario worker that compares baseline and counterfactual outcomes while checking live-state immutability; a versioned API surface; a dashboard that exposes the machine and process views; and a deployment package for a multi-service environment.

These contributions are concrete software artifacts. Their significance is bounded by the evidence available: repository records and its dated verification log. Physical model calibration, cybersecurity evaluation, load testing, operations research, and field usability testing remain further work.

## 1.10 Organization of the thesis
Chapter 1 establishes the project context, problem, objectives, scope, and limitations. Chapter 2 reviews manufacturing digital twins, industrial communication, causal simulation, event reduction, process flow, and counterfactual evaluation. Chapter 3 describes the engineering methodology and verification design. Chapter 4 presents requirements, architecture, data contracts, station models, services, user interface, and deployment. Chapter 5 reports the implementation evidence and discusses what can and cannot be concluded from it. Chapter 6 summarizes outcomes and recommends a staged path toward hardware integration and measured validation. The appendices provide traceability, API and data references, operational guidance, evidence templates, and selected source listings.

# Chapter 2 Literature Review

## 2.1 Digital twin concepts in manufacturing
Digital twin terminology is used across engineering domains, and the literature has not always applied one uniform definition. Reviews describe a progression from virtual product and lifecycle models toward operational representations synchronized with data from a physical counterpart [3], [4]. For a manufacturing use case, NIST presents a fit-for-purpose digital representation of an observable manufacturing element with synchronization between that element and its representation [1]. This definition stresses purpose and synchronization; it does not prescribe one modeling technique or one communications protocol.

This distinction matters for the present project. A static 3D model is not sufficient to support event ordering or trace material lineage. A database record without a relationship to a modeled station is also incomplete as a process twin. A useful prototype has to identify what it represents, what events update the representation, what computations are performed, what decisions are supported, and what evidence confirms the intended behavior. The platform treats a station twin as the latest validated operational state plus telemetry, health, production, fault, desired-state, synchronization, and identity information.

## 2.2 Standardized manufacturing architecture
ISO 23247 provides a reference framework for digital twins in manufacturing. Its parts address general principles and requirements, a reference architecture, information attributes for observable manufacturing elements, and technical information exchange requirements [2]. NIST work on applying the framework describes manufacturing use cases and implementation procedures [8], while later NIST work discusses standardization challenges and directions [7]. These sources support an architecture organized around a manufacturing element, a digital representation, data acquisition, and user or application functions.

The project adopts these ideas as architectural guidance rather than claiming conformance certification. It models five machine elements and exposes functional views that resemble common manufacturing twin concerns: telemetry and health, process sequence, token lineage, bottleneck analysis, and scenario evaluation. The platform does not implement all reference architecture entities, nor does it provide a formal conformance test. Its API contract and database shape are project-specific and would need mapping to a standards-based model before interoperability claims could be made.

## 2.3 Digital twin and simulation relationship
Simulation is one possible capability inside a digital twin, but simulation alone does not provide synchronization, identity, history, or operational context. A model may run as an isolated experiment, while the live representation must remain tied to a stream of observations. Literature on digital twins emphasizes integration among physical entities, models, data, and intended use, and recognizes simulation as one of several analytical capabilities [1], [4].

In this project, the causal factory model and the Live Twin reducer are separate modules. The simulator advances station state and emits telemetry envelopes. The reducer consumes versioned events and materializes a current twin. This design allows the same reducer to receive MQTT events or controlled HTTP ingestion, while the model can be replayed under seeded conditions. It also makes an important limitation visible: a deterministic replay verifies repeatable software output, not accuracy against an industrial machine.

## 2.4 Industrial communication and event transport
MQTT is a client-server publish/subscribe transport designed for lightweight, decoupled messaging and constrained environments [5]. A publisher sends a message to a topic and subscribers select topics of interest. This pattern allows the simulator, broker, Live Twin consumer, and browser-facing systems to evolve independently. The platform uses a canonical factory topic namespace under factory/v1 and includes separate telemetry, state, fault, production, command, and summary categories in its documented taxonomy.

The MQTT consumer currently subscribes to canonical telemetry topics and forwards valid event envelopes to the same Live Twin service used by the internal ingestion route. The project configuration exposes conventional TCP and WebSocket listeners. The reference Mosquitto configuration uses anonymous access, which is acceptable only in an isolated demonstration environment. Production use requires authenticated identities, authorization by topic, encrypted transport, network segmentation, secrets management, and review of broker persistence and availability.

OPC Unified Architecture is a platform-independent industrial information and communication framework covering information, message, communication, and conformance models [6]. It is relevant as a future device integration option, but it is not the implemented telemetry protocol in this repository. The architecture currently uses an abstract adapter-capable event contract and an MQTT consumer. A real OPC UA adapter would need to map node identities, units, timestamps, quality flags, security identities, and machine-specific semantics into the defined event model.

## 2.5 Versioned data contracts and event identity
Data contracts provide a stable boundary between producers and consumers. The project defines Pydantic models with strict handling of extra fields, typed enumerations, numeric bounds, and aware timestamps. The event envelope includes a schema version, event identifier, run identifier, machine identifier, kind, per-run sequence, generation timestamp, optional receive timestamp, correlation identifier, and a payload. The telemetry payload covers shared measurements and optional station-specific values.

Stable identity is central to safe event processing. A deterministic event identifier is derived from run, machine, event kind, and sequence. This supports replay and duplicate detection. The contract separates generated time from received time: the simulator cannot claim an observed receive timestamp. The Live Twin assigns receive time at consumption, which permits delivery and source-age calculations from clocks that actually exist at the service boundary. Contract validation cannot prove sensor calibration or clock synchronization; it only checks structure and declared value constraints.

## 2.6 State reduction, ordering, and idempotency
Distributed message delivery can involve retries, duplicate delivery, delay, and out-of-order events. A reducer turns accepted input events into a current operational view while retaining an event history. The platform stores monotonic sequence state for each machine and uses an event identity barrier in the repository. A repeated event is treated as a no-op. A late event can remain in event history without replacing a newer current state. These behaviors separate auditability from current-state materialization.

The design uses a repository abstraction so that in-memory development storage and MongoDB persistence present the same service-facing operations. The MongoDB implementation creates indexes and uses the event identifier as a unique insertion barrier. It stores current twin state separately from events and telemetry. This structure allows recent state to be queried without replaying all events, while preserving an event record for trace and troubleshooting use cases.

## 2.7 Causal and physics-informed modeling
Data-driven models learn associations from historical observations; physics-based models encode relationships from a system's mechanics; reduced-order models retain selected causal structure while avoiding the cost of a high-fidelity simulation. The current code implements deterministic reduced-order models with separate station classes. It includes degradation variables, operating-state effects, bounded metrics, and seeded noise. A nominal model may be repeatable and causally legible while still requiring calibration before being used to infer real equipment behavior.

For example, the CNC model separates tool wear, bearing degradation, coolant failure, cutting force, temperature, current, vibration, target RPM, actual RPM, quality, and health. A tool-change operation resets tool wear but need not erase bearing degradation. A coolant failure contributes a thermal penalty. Such separations are preferable to one unconstrained random health value because they support directional tests and interpretable counterfactuals. Coefficients in these equations are model parameters, not externally validated machine constants.

## 2.8 Process-level digital twins and material flow
A production system twin must represent relationships among workstations and parts. The project represents the five-station route as a directed acyclic graph and records order explicitly. Each station has an upstream and downstream relationship. The simulator prevents a station from completing work when upstream production has not supplied a part and prevents an upstream station from creating work beyond its downstream buffer limit. This is a software representation of starvation and blocking, not a full discrete-event scheduling system.

The additional production token represents one part moving through the process. It accumulates station identifiers and selected quality or process flags. Inspection determines whether the part is accepted for packaging or rejected. The token lineage makes a downstream quality outcome inspectable against upstream signals. The token model is deliberately lightweight; it does not represent a full bill of materials, operation routing with alternative paths, rework, lot genealogy, labor, or a validated quality control plan.

## 2.9 Bottleneck reasoning
Throughput in a serial production line is constrained by station capacity and state. The platform estimates a binding station from reported cycle time adjusted by an operational-state penalty. It calculates slack relative to the maximum effective cycle time and derives a nominal per-hour capacity from the binding time. For the configured nominal cycle times, CNC-01 has the largest cycle time at 42 seconds. In a purely nominal calculation, this is approximately 85.7 cycles per hour before availability, yield, setup, queueing, or shift effects.

That calculation is a configured capacity proxy, not a measured production rate. In practice, bottleneck location can change when a station is degraded, faulted, idling, or running under an override. The scenario worker recomputes the binding station for both baseline and counterfactual outcomes. Such comparison can expose a bottleneck shift inside the model, but the result should not be described as a factory improvement until the model parameters and operating conditions are validated.

## 2.10 Counterfactual simulation and immutability
What-if analysis compares a baseline model with a modified model under shared initial conditions. If initial state or random seed differs, the output difference may reflect uncontrolled variation rather than the intervention. The Scenario Worker resolves a frozen line snapshot, creates separate baseline and counterfactual factories using the same seed, applies overrides only to the latter, advances both for a defined horizon, computes deltas, and checks a fingerprint of Live Twin state before and after.

This design provides a software-level guard against scenario leakage. It also enables repeatable experiments for tool replacement, coolant failure, cadence change, welding electrode wear, line outage, and alternative CNC capacity assumptions. A scenario response remains conditional on the current model and its assumptions. It can support operator discussion or research planning but does not directly actuate production equipment or provide a safety authorization.

## 2.11 Dashboards and decision support
Dashboards are operational interfaces that turn data and model state into views suited to different decisions. The frontend separates fleet overview, 3D factory view, production flow, machine detail, twin studio, maintenance, analytics, events, and system health. The Twin Studio includes the live twin cockpit, scenario studio, and process graph and lineage views. The production page surfaces queue counts, starvation, blocking, token status, and upstream defect attribution.

The UI should preserve distinctions between measured values, model estimates, and simulation results. The current app signals backend readiness and MQTT status, while API requests are live-first and do not silently switch to mock data by default. Any interface values captured during a simulator session should be labeled as simulated observations. Usability tests with operators and accessibility checks are not recorded in the repository, so this thesis describes implemented interaction patterns without claiming validated usability.

## 2.12 Container deployment and operational security
The repository includes a multi-service Docker Compose stack with MQTT, MongoDB, FastAPI backend, and React frontend, along with Kubernetes manifests for a namespace, configuration, database, broker, backend, frontend, and ingress. Health and readiness probes distinguish process liveness from application readiness. The architecture is portable at the service and environment-variable level, but availability, scaling, backup, secrets, and security policies still need environment-specific configuration.

Security is especially important where a twin can influence operator actions or expose process data. The current prototype does not document user authentication, fine-grained authorization, TLS configuration, a threat model, or a security test. MQTT anonymous access is enabled in the provided broker file. These facts limit safe deployment to an isolated demonstration setup until authentication, network controls, auditing, secrets, and a production operations model are designed and reviewed.

## 2.13 Literature synthesis and research gap
The literature and standards point to a consistent set of design concerns: fit the twin to its purpose; represent manufacturing elements and information exchange explicitly; keep model behavior connected to operational data; preserve the semantics of events; make process relationships visible; and use evaluation evidence that corresponds to the claim being made [1], [2], [3], [5], [6], [7]. The existing project implements a subset of those concerns in a compact, testable stack.

The gap addressed here is not a lack of another generic dashboard. It is the need for a demonstrable integration pattern that joins station-level telemetry, causal model state, line-level material constraints, event-order protection, token lineage, and isolated scenario comparison. The prototype's contribution is architectural cohesion and software verification. Its unresolved research gap is the empirical bridge from model behavior to a real line: parameter estimation, clock quality, sensor calibration, throughput and latency measurement, predictive validity, human factors, and cybersecurity.

### Table 2.1 Comparison of relevant approaches
| Approach | Main strength | Limitation for this project | Design response |
| Manufacturing framework [1], [2] | Shared vocabulary and composable architecture | Framework is not a complete application implementation | Implement focused station and line services |
| Publish/subscribe transport [5] | Producer-consumer decoupling | Transport delivery alone does not define current state | Add versioned envelope and reducer |
| OPC UA information exchange [6] | Industrial information and interoperability model | Not currently used as a device protocol | Keep adapter boundary and document future mapping |
| Static dashboard | Low effort and clear visual summary | No event history, material lineage, or isolated scenarios | Integrate event, process, and scenario services |
| Standalone simulation | Repeatable model exploration | Does not maintain a live operational view | Fork snapshots and isolate scenario state |

# Chapter 3 Methodology

## 3.1 Engineering approach
This work follows an artifact-centered engineering method. The target artifact is a simulator-backed command center for a bounded manufacturing line. Requirements are derived from the repository's project definition and the intended Industrial IoT use case. The implementation is divided into domain contracts, physical model behavior, live-state reduction, process composition, scenario execution, user interface, persistence, and deployment. Each subsystem exposes contracts that can be exercised independently.

The method combines system decomposition with iterative verification. A change is treated as complete only when the relevant behavior is implemented and the repository's recorded checks support the claim. The delivery log shows staged development from contracts and causal simulation through persistence, process flow, scenario work, UI, containers, and material-flow corrections. The thesis uses this chronology as project history; it does not infer measured performance from the sequence of implementation phases.

## 3.2 Requirements elicitation and traceability
Functional requirements were derived from the project objective and organized around observable behaviors. Examples include validating telemetry, preserving event identity, refusing an invalid machine-payload pairing, listing the five twins, analyzing process bottlenecks, tracing defects, and running scenarios. Non-functional requirements include deterministic replay, state isolation, bounded memory, deployability, clear health checks, and a single source of truth for interface contracts.

Traceability links each requirement to at least one module and one verification method. Unit tests are appropriate for deterministic model direction, event order, token progression, and scenario immutability. API tests verify route contracts and status behavior. Frontend compilation verifies TypeScript and bundler compatibility. Container manifests establish deployability intent but do not prove deployment success in a target cluster. Field calibration, throughput scaling, latency percentiles, and recovery under hardware or network faults require experiments not represented by the current log.

## 3.3 System boundary and actors
The system boundary begins at a simulator or adapter that creates station observations and ends at dashboard users or a client consuming the API. In the current build, the simulator is the concrete telemetry source. A future edge adapter can publish the same envelope to MQTT. The broker distributes events to a Live Twin consumer; repositories store current twins and history; the Process Twin composes station state; the Scenario Worker runs isolated model forks; FastAPI exposes functions; and the browser renders operational views.

Primary actors are an operator who inspects the line and issues supported simulation commands, an engineer who reviews telemetry and scenario deltas, and a developer or administrator who configures storage and deployment. The current prototype has no identity and access management model, so these are logical user roles rather than authenticated accounts. The APIs are not safety PLC interfaces and do not replace interlocks, safe operating procedures, or machine protection.

[[FIGURE:dataflow]]

## 3.4 Station model and deterministic execution
Each station is represented by a station configuration, an operational state, degradation variables, production counters, energy accumulation, cycle progress, and a seeded random generator. The factory config establishes the nominal sequence and cycle time. The configured values are 8.5 seconds for Stamping, 42 seconds for CNC, 15 seconds for Welding, 6 seconds for Inspection, and 10 seconds for Packaging. These values provide the baseline for the software demonstration.

Station subclasses map different mechanisms into telemetry. Stamping uses die wear and fault level to influence force, vibration, current, temperature, cycle time, quality, and health. CNC distinguishes tool and bearing degradation and models coolant failure. Welding models electrode and clamp wear with voltage, current, temperature, and quality response. Inspection represents quality review; Packaging has conveyor wear and throughput-related telemetry. The use of separate state variables makes model direction inspectable and enables focused tests.

The simulator uses independent seeded random streams for station models. A fixed seed and equal initial state produce repeatable generated variation, allowing regression comparisons. Seeded randomness is not a substitute for statistical characterization. The implementation does not assert that a particular seed or noise distribution represents natural plant variation.

## 3.5 Telemetry envelope and validation
Every canonical event carries a schema version, deterministic event ID, run ID, machine ID, kind, positive sequence, generation time, optional receive time, optional correlation ID, and a JSON payload. The telemetry payload contains a station type, operational state, status, simulated time, temperature, vibration, current, optional voltage, force, pressures and RPM, cycle time, energy, output, WIP, health, anomaly, quality, wear, fault code, and source.

Pydantic validation constrains values and rejects unknown fields at strict model boundaries. Timestamps must include timezone information and are normalized to UTC. Optional fields are omitted when a station does not expose that measurement; the contract avoids manufacturing nonexistent signals. The event identity function uses a namespaced UUID derived from run, machine, event kind, and sequence, so a deterministic run can reconstruct stable identifiers.

## 3.6 Live Twin reducer method
The reducer accepts telemetry envelopes only. It records the consumption time, validates the payload, confirms that the outer machine identifier matches the payload, and compares the sequence with the current twin. If the sequence is newer, it constructs a replacement twin record with identity, operational state, telemetry, health, production, fault, desired-state, synchronization, revision, and event metadata. If the event is out of order, it retains the event while preserving the existing current state. The repository's event identity barrier prevents duplicate writes from changing state.

Delivery latency is the nonnegative difference between receive time and generated time. Processing latency is measured around the reducer's validation and reduction work using a monotonic performance counter. Source age is based on the same generation-to-receive time gap in the current record. These fields are meaningful only when clocks and timestamps are meaningful; the repo does not publish a benchmark distribution. Figure 3.2 summarizes the update decision.

[[FIGURE:reducer]]

## 3.7 Material-flow method
The Process Twin defines a versioned topology with five ordered nodes and material-flow edges. Its snapshot function reads available twin documents and orders them by station index. Production tokens represent a part and carry quality flags, signal values, and station lineage. Inspection calculates a bounded defect probability from upstream quality inputs; it sets a pass or fail status and sends accepted parts to Packaging while failed parts remain scrapped.

The simulator links adjacent station models. A downstream station pauses when its upstream output has not produced a corresponding part. An upstream station pauses when the difference between its output and downstream output reaches the maximum buffer of five. The system-level conservation invariant is therefore Packaging output less than or equal to Inspection output, which is less than or equal to Welding, CNC, and Stamping output. This invariant holds for the model's sequential pipeline; it is not a claim about all production systems.

[[FIGURE:materialflow]]

## 3.8 Snapshot and scenario method
A scenario request includes a name, description, horizon, time step, seed, optional snapshot ID, and station overrides. The worker captures or resolves a frozen line snapshot, calculates a fingerprint of Live Twin state, creates a baseline factory from the snapshot, and runs it forward. It then creates a second factory from the same snapshot and seed, applies the requested changes only to that factory, and runs the same horizon. The worker calculates output, scrap, quality, energy, health, bottleneck, and trajectory comparisons.

After both runs, the worker recalculates the live-state fingerprint. If it differs, the scenario is rejected as a critical immutability violation. Completed results are persisted through the scenario repository. This flow controls a specific risk—accidental modification of live twin state. It does not validate model fidelity or guarantee that all external side effects would be isolated if new integrations were added.

[[FIGURE:scenario]]

## 3.9 API and user-interface method
FastAPI routes expose readiness, legacy machine telemetry, current twins, event history, process topology and views, production tokens, defect traces, scenario execution, and simulator controls. The domain contracts are mirrored into TypeScript types. The dashboard uses polling hooks for versioned endpoints and has an MQTT hook for browser streaming. The live-first policy requires API health in the operational UI rather than silently making simulated mock state appear live.

The interface is organized around decisions. Overview answers whether the line appears active and what its totals are. Production shows station sequence, buffers, tokens, and defects. Machine views show station-level state. Twin Studio combines the live cockpit, what-if comparisons, and process lineage. Events supports history review; System displays service readiness and synchronization instrumentation. This organization is described from the source routes and components, not from a user study.

## 3.10 Verification and evaluation design
Verification is separated into levels. Unit tests target model direction, determinism, validation, reducer idempotency, snapshot consistency, token flow, bottleneck logic, and scenario isolation. API tests exercise routes and error responses. Frontend build evidence verifies type checking and bundling. Deployment manifests and health probes establish an integration design, but a successful frontend build or unit test does not prove that Docker or Kubernetes was started in a target environment.

The dated delivery log reports 48 backend test cases in the final material-flow verification entry, with two skipped, and a successful frontend production build with no errors. That is repository-reported evidence, not a fresh test run performed for this thesis. The available log does not provide raw test output beyond its summary or measured runtime across hardware. Accordingly, this thesis reports implementation checks and designs a future empirical evaluation rather than inventing latency, fidelity, or throughput results.

## 3.11 Research ethics and operational constraints
The prototype uses no personal manufacturing data or customer records in the described project scope. It models a generic automotive-component line. If a real site is added, operational telemetry may be commercially sensitive and can reveal production capacity or maintenance condition. Data collection therefore requires organizational authorization, data minimization, retention rules, access control, and a threat model. The application should not be used to issue machine-control commands until control ownership, safe states, network segmentation, human approval, and safety certification are defined.

## 3.12 Reproducibility record
Reproduction requires the source repository, its Python and Node dependency lock/configuration, the chosen persistence mode, MQTT configuration, and fixed random seed. The API accepts seed parameters for scenario presets and the simulator assigns a run identifier to event identity. The repository log names the verification commands, but environment versions and a full experimental dataset are not included here. A complete scientific replication package should archive the source commit, dependency versions, configuration, generated traces, test output, benchmark harness, and hardware details.

# Chapter 4 Software and Hardware Requirements and Design

## 4.1 Functional requirements
The design shall generate or accept telemetry for five named stations; validate event envelopes; maintain one current twin record per machine; retain event history; ignore duplicate events; prevent late sequences from rolling state back; calculate observed timing fields; expose the station graph and a frozen snapshot; identify the effective bottleneck; emit and query part tokens; preserve lineage and quality flags; trace upstream defect contributors; run baseline and counterfactual simulations; persist scenario results; provide a live-first dashboard; and expose liveness and readiness routes.

## 4.2 Non-functional requirements
Determinism is required for controlled replay. Modularity is required so model, reducer, process, scenario, API, storage, and UI concerns can be evolved independently. Contracts must constrain values and reject schema drift. The event processor must be idempotent at the persistence boundary. State comparisons must use common initialization and seeds. Readiness information must distinguish startup from healthy execution. The application should remain runnable without cloud credentials and support a local in-memory repository while retaining a durable MongoDB path.

## 4.3 Software and hardware environment
The backend uses Python, Pydantic, FastAPI, a MongoDB driver, and an MQTT client. The frontend uses React 19, TypeScript, Vite, browser polling, and an MQTT-over-WebSocket hook. Mosquitto is the MQTT broker and MongoDB is the durable document store. Docker Compose orchestrates the full local stack, while Kubernetes manifests describe a multi-service deployment.

The model can be developed on a conventional workstation. No PLC, sensor, industrial PC, CNC controller, welding controller, or hardware-in-the-loop test equipment is part of the supplied repository evidence. This is a software prototype. A future installation requires edge devices or gateways, physical machine signal definitions, network interfaces, clocks, calibrated sensors, protective network infrastructure, and approval by the facility's engineering and cybersecurity teams.

### Table 4.1 Main software components
| Component | Technology or module | Responsibility |
| Event contract | Pydantic domain models | Typed messages and stored twin records |
| Simulator | Pure-Python causal models | Station state and telemetry generation |
| Event transport | Eclipse Mosquitto and Paho consumer | Asynchronous event distribution |
| Live state | LiveTwinService | Validation, sequencing, reduction, timing |
| Persistence | Repository interface, MongoDB, in-memory adapter | Current state, events, telemetry, tokens |
| Process layer | ProcessTwinService | Topology, snapshots, tokens, bottleneck and defect trace |
| Scenario layer | ScenarioWorkerService | Isolated forward comparisons and results |
| API | FastAPI | Versioned application boundary |
| Dashboard | React and TypeScript | Monitoring, production, twin, and diagnostics views |
| Packaging | Docker Compose and Kubernetes | Repeatable service deployment structure |

## 4.4 High-level architecture
The architecture separates generation, transport, reduction, process composition, scenario analysis, storage, API, and presentation. Telemetry can use MQTT or the controlled event ingestion route. Both routes call the same Live Twin service. The process layer queries the twin service and repository. Scenario execution uses snapshots and isolated factories. The browser consumes HTTP endpoints and may subscribe to the MQTT WebSocket stream. Storage is abstracted so local development can run in memory and container deployments can use MongoDB.

[[FIGURE:architecture]]

## 4.5 Station configuration and nominal capacity
The station configuration is declared in code rather than loaded from an external plant database. The configured cycle times are Stamping 8.5 seconds, CNC 42 seconds, Welding 15 seconds, Inspection 6 seconds, and Packaging 10 seconds. Stamping, CNC, and Packaging also expose nominal RPM values in the model configuration. The 42-second CNC cycle defines the nominal line constraint in the default configuration.

For comparison only, theoretical station capacity is calculated as 3,600 seconds per hour divided by configured cycle time. This produces approximately 423.5 cycles/hour for Stamping, 85.7 for CNC, 240 for Welding, 600 for Inspection, and 360 for Packaging. This model-derived comparison omits downtime, buffers, yield, shift breaks, changeovers, operator interaction, and real cycle-time variation. It must not be used as measured factory output.

[[FIGURE:cyclechart]]

## 4.6 Causal station models
The common station base class owns the model clock, station state, fault state, cycle accumulator, energy total, seeded random stream, station connections, and buffer limit. Each concrete station defines its own degradation variables and equations. All models return bounded telemetry fields and distinguish idle or stopped behavior from active production. The model attenuates activity while idle, faulted, offline, or in maintenance so that zero production does not coincide with continuing cutting force or active wear.

The Stamping model links die wear and fault severity to required force and resulting current, vibration, temperature, cycle time, quality, health, and anomaly indicators. The CNC model separately represents tool wear and bearing degradation. Cutting force is influenced by load and tool wear; current reflects force and bearing wear; temperature includes wear and a coolant failure penalty; RPM tracking error changes with load and degradation; and health and quality are bounded. A tool change resets tool wear and clears relevant fault state without pretending that every underlying component has been renewed.

Welding models electrode wear and clamp degradation with current, voltage, temperature, and quality consequences. Inspection supplies quality-related station behavior and does not mimic a full machine-vision classifier. Packaging models conveyor wear, energy, vibration, RPM, and cycle time. These formulations produce causal direction for scenario and unit tests, but the repository itself notes that coefficients require calibration against public or site datasets before physical validation.

## 4.7 Material constraints and buffer semantics
The factory wires adjacent station models into a sequential chain and sets a maximum buffer of five. A station with an upstream relation cannot advance when it has no upstream part available. A station with downstream relation pauses when the gap between its own completed count and the downstream completed count reaches the buffer limit. The flow-control code therefore handles starvation and blocking at the production-advance step, before the next telemetry summary is emitted.

The model's count invariant is explicit: packaging output cannot exceed inspection, welding, CNC, or stamping output. Work in progress is derived from differences between adjacent cumulative counts. The dashboard shows queue indicators and STARVED/BLOCKED tags. The current representation is adequate for a single path with uniform tokens; alternative routings, rework loops, batch operations, changeover setup, and variable scrap destinations need an extended process model.

## 4.8 Event and twin data model
The EventEnvelope stores transport metadata separately from the TelemetryPayload. The latter includes common measurements plus optional fields such as force, hydraulic or pneumatic pressure, voltage, RPM, and fault code. The Live Twin stores nested identity, operational, telemetry, health, production, faults, desired state, synchronization, last event ID, revision, and update time. This nested shape reduces the need to reconstruct a current station view from many independent records.

MongoDB stores current twins, event envelopes, telemetry history, scenarios, and production tokens in separate collections. The Mongo twin repository creates indexes for station order, event machine/time, telemetry event identity and machine/time, and token identity, emitted time, and quality. The repository uses a unique event key as a duplicate barrier. A comment in the source notes that stronger transaction guarantees may require a MongoDB replica set when write sequences span collections.

### Table 4.2 Event timing fields
| Field | Source | Meaning | Limitation |
| generated_at | Producer | Timestamp when observation was formed | Depends on producer clock |
| received_at | Live Twin consumer | Timestamp at service receipt | Not present until consumption |
| delivery_latency_ms | Receive minus generated time | Observed message delay proxy | Clock skew can distort value |
| processing_latency_ms | Monotonic counter in reducer | Local validation and reduction time | Not full API or database latency |
| source_age_ms | Current implementation from generation-to-receive difference | Age of the source observation at receive | No value for absent or untrusted timestamps |

## 4.9 Live Twin state transitions
The reducer receives a telemetry event and first checks kind and time-zone validity. It validates the nested payload and machine identity. A newer sequence produces a new materialized state and an updated revision. An older or equal sequence preserves the current state while retaining the event record. If the same event ID is repeated, repository insertion is not applied again. This architecture distinguishes sequence monotonicity from event identity: both checks matter because a message can be repeated or arrive late.

The synchronization object records the latest sequence, generation and receipt times, delivery latency, processing latency, and source age. Desired-state commands are represented separately from observed operational state so that requested control and actual state can later be distinguished. The current implementation's event reducer consumes telemetry; it does not implement a complete command acknowledgement lifecycle for real equipment.

## 4.10 Process Twin, topology, and snapshots
The canonical topology version is five-station-v1. Nodes carry machine ID, station type, index, nominal cycle time, and upstream/downstream machine IDs. Edges have a material_flow transition type. The Process Twin builds a view from the current station records and derives production line metrics. Snapshot capture orders the available twins by station index and records a snapshot ID, capture time, and topology version.

The snapshot is an immutable value passed to scenario creation. It contains the current twin documents and ensures baseline and counterfactual factories start from an equivalent state. The worker maintains a bounded in-memory cache of snapshots. Long-term scenario results are stored separately so a completed analysis can be retrieved without mutating current station records.

## 4.11 Production token and defect trace
The token has an identifier, part type, quality state, source station, emission time, carried flags, and ordered station lineage. The implementation records stamping quality and force when present; machining quality and CNC wear values; welding quality and voltage; inspection defect probability and verdict; and disposition. A pass adds Packaging to lineage; a failure is marked scrapped. The token repository allows retrieval and filtering by quality or station.

Defect attribution examines recent tokens and their carried flags to identify upstream contributors. The function reports the number of tokens evaluated, defective count, defect rate, primary source, and station-level contribution. This is a model-based attribution rule using the recorded token values. It is not a causal inference study on production data, nor should the percentages be presented as statistically validated process attribution.

## 4.12 Bottleneck calculation
For each station, the process service reads the current reported cycle time or uses the nominal configuration when needed. It applies a status factor: 1.00 for running, 1.15 for warning, 1.35 for degraded, 10.0 for fault or offline, 5.0 for maintenance, and 1.2 for idle. The maximum effective cycle time is the binding line time. Capacity per hour is calculated as 3,600 divided by that value. Slack is the nonnegative difference between the binding time and each station's effective time.

The penalty factors are design heuristics. They create consistent state-sensitive comparisons but do not originate from measured availability data. A real line should estimate effective cycle from logged production events or a validated cycle-time model and should distinguish temporary setup, planned downtime, faults, micro-stops, rework, and capacity sharing.

## 4.13 Scenario Worker and presets
The scenario worker runs an equal-horizon baseline and counterfactual. A result stores identifiers, status, seed, horizon, time step, overrides, both line outcomes, comparison values, and a sampled trajectory. The comparison includes output and scrap deltas, quality and energy changes, CNC health change, and bottleneck shift. A bounded number of snapshots is held in memory; scenario records use the configured repository adapter.

The codebase defines presets for CNC speed changes, a parallel CNC approximation, cadence derating, an unplanned CNC outage, preventive tool change, coolant failure, cadence boost, and welding electrode wear. A parallel CNC preset currently represents effective cycle-time scaling on the CNC station; it does not add a physically separate machine node to the process topology. That distinction should remain explicit in any interpretation of the preset.

[[FIGURE:scenario]]

## 4.14 REST API design
The API uses unversioned compatibility routes for the original dashboard and versioned routes for twins, events, process, and scenarios. Health and readiness endpoints support orchestration. Requests are validated against typed response models where practical. Not-found conditions return 404 for unknown objects; malformed event ingestion returns 422; scenario failures are translated into a client error response. A scenario analysis route can optionally invoke a reasoning service, but the core scenario simulation is available without that service.

The API boundary is a practical integration surface, but CORS is broadly configured in the current FastAPI application and there is no authentication middleware in the examined source. Production rollout requires a stricter origin allowlist and identity-aware authorization. Write operations such as fault injection, reset, and scenario deletion require role-specific access rules before exposure on an operational network.

## 4.15 Frontend design
The React router organizes overview, 3D factory, production, machine registry, machine detail, twin studio, maintenance, analytics, events, and system pages. TypeScript interfaces mirror Python contracts. Polling hooks query readiness and twin/process endpoints. The header reports backend readiness and the selected persistence mode. The Process and Twin Studio pages visualize stations, WIP buffers, status, lineage, and scenario deltas.

An existing interface capture is included as a visual reference. It shows one simulator-backed dashboard state and should be read as a user-interface illustration. Values visible in a capture are not manufacturing measurements. The frontend build log provides compilation and bundling evidence, but does not establish usability, accessibility, or correctness of every dynamic screen under network interruption.

[[SCREENSHOT]]

## 4.16 Deployment architecture
Docker Compose defines broker, database, backend, and frontend services on a shared network. The backend waits for database health and broker startup; health checks are assigned to services; MongoDB uses a named data volume. The front end is built as static assets and served through Nginx with API and MQTT endpoints configured by build arguments. Kubernetes files define corresponding workloads, services, configuration, storage, ingress, and health/readiness probes.

These files document a deployable topology, not a successful production deployment. Image tags, storage class, ingress controller, secrets, access policies, TLS, backup, and failure domains must match the intended cluster. The provided MongoDB standalone setup is a development and demonstration configuration, not a high-availability production database. Broker anonymous access must be disabled and replaced with authenticating clients and topic authorization.

[[FIGURE:deployment]]

## 4.17 User workflows
An operator opens the overview and checks readiness before trusting live views. The operator selects the production or machine page to inspect current simulated state, station status, buffer counts, and event history. To explore an intervention, the user opens the Twin Studio, selects a scenario and horizon, runs the comparison, and reviews baseline/counterfactual cards and station-level outcomes. The user can follow a production token through lineage and inspect quality flags. A maintainer checks system readiness and measured synchronization fields, while understanding that metrics are unavailable until an event with valid time data is consumed.

The workflow is intended for monitoring and analysis. It does not send control directly to a physical machine. Simulated command and fault controls are useful for exercising the interface and model state, but connecting them to equipment would require control-system ownership, operator authorization, safety analysis, state reconciliation, command acknowledgements, and fail-safe behavior.

## 4.18 Design trade-offs
The architecture prefers explicit module boundaries over a single all-purpose service. This makes the project easier to test and evolve but introduces more contracts and data transformations. MongoDB is flexible for nested twin documents and event history, but transactional guarantees and operational lifecycle need careful configuration. MQTT decouples publishers and consumers, but topic access and delivery semantics must be designed. Polling is simple to deploy, while WebSocket or MQTT streams can reduce refresh delay and add connection-management complexity.

Reduced-order physical models are more interpretable than opaque random telemetry, but have lower fidelity than calibrated multiphysics models. Frozen snapshots improve comparison validity, but scenario results remain conditional on state quality and model assumptions. The dashboard offers a wide operational surface in the prototype, while the absence of identity and usability evaluation limits production readiness. These trade-offs are recorded to guide future engineering decisions rather than treated as resolved universal choices.

## 4.19 Design decision summary
The main design choices and their evidence boundaries are summarized below. The choices support a coherent simulator-backed demonstrator; each still has a clear next step before use with physical equipment.

| Decision area | Chosen design | Evidence boundary |
| State authority | Live Twin reducer owns materialized current state | Duplicate and sequence checks are implemented; source clock accuracy is not validated |
| Process representation | Ordered five-station graph with buffers limited to five units | Single route only; alternative paths and rework are not represented |
| Scenario comparison | Same frozen snapshot and random seed for both runs | Isolation is checked in software; outcomes remain model-dependent |
| Persistence | Repository interface with in-memory and MongoDB adapters | MongoDB transaction guarantees depend on deployment configuration |
| User interface | React dashboard over typed API routes | Production build is recorded; usability and accessibility studies are absent |

# Chapter 5 Results and Discussion

## 5.1 Implementation status
The repository history records staged implementation of the system. The early phase introduced strict contracts and deterministic station models. Subsequent work added a MongoDB/in-memory repository interface and Live Twin reducer; process topology, snapshots, tokens, bottleneck and defect analysis; counterfactual scenario execution; a typed live-first dashboard; and container and Kubernetes packaging. The October 2026 entries record additional material-flow coupling, starvation and buffer blocking, token persistence, event routes, and a dashboard redesign.

The final material-flow log reports 48 backend test cases, two skipped, with the run described as successful. It also reports a frontend production build with zero errors. This is the evidence available in the project progress record. It is not a benchmark report, a field acceptance test, or independently repeated verification. A thesis submission should retain the source repository and test output if the examiner asks for detailed confirmation.

## 5.2 Functional outcomes
The implemented backend maintains a current twin record and recent event information per station. The process layer reports topology, process view, snapshots, bottleneck status, tokens, and defect traces. The scenario worker returns comparable baseline and counterfactual line outcomes and preserves Live Twin state. The dashboard exposes these structures through station cards, production queues, token inspection, scenario cards, analytics, events, and system views.

At the material-flow boundary, starvation and blocking are implemented in the causal model. A downstream station cannot produce without upstream supply, and a station may not run its upstream buffer beyond five units. The progress log reports a regression check for the line conservation invariant. These behaviors are stronger evidence than a UI-only flow animation because the invariant is enforced in production advance logic and tested in the backend model suite.

## 5.3 Model configuration results
The model's nominal cycle-time configuration makes CNC-01 the slowest station at 42 seconds. The derived idealized capacity proxy is 85.7 cycles per hour for CNC-01. The other stations have higher nominal rates before disruptions. This configured relationship explains the default bottleneck designation. It does not include line availability, product mix, scrap, downtime, maintenance, or physical measurement.

The 3D dashboard capture shows a particular simulator state, including machine status cards, telemetry values, WIP indicators, and navigation. The screenshot is useful as implementation evidence for visual integration. Since it records one application session and the backend is a simulator-backed prototype, it is not evidence of actual factory throughput, OEE, health, or production quality.

[[FIGURE:capacitychart]]

## 5.4 Verification results in the repository log
The latest recorded verification summary on 2026-10-20 states that 48 backend tests ran successfully with two skipped, and that the production frontend build passed. Earlier phase logs give smaller cumulative counts as modules were added: 14 after initial causal contracts, 27 after live twin storage, 37 after process twin work, 45 after scenarios and dashboard work, and 47 after deployment work. These figures reflect successive logged snapshots; they are not independent test populations and should not be summed.

The two skipped tests are associated in the project log with optional Bedrock integration. Core simulation and twin behavior is intended to operate without cloud credentials. The exact individual pass/fail output is not embedded in this thesis; the status is attributed to the progress record. The chart below summarizes only the final recorded test count and skipped count.

[[FIGURE:testchart]]

## 5.5 Test behavior coverage
The source test suite includes deterministic seed replay, fault direction, tool-change reset, invalid time step rejection, telemetry validation, duplicate event no-op, preservation of current state for late events, machine identity mismatch rejection, ordering, bounded history, MQTT adapter behavior, topology structure, snapshot capture, token progression and filtering, nominal and fault-driven bottleneck analysis, defect tracing, scenario immutability, counterfactual direction, repository operations, health/readiness routes, and API behavior.

These tests provide evidence about specified code paths and regression behavior. Unit tests cannot establish whether the causal coefficients represent a real machine. A test that verifies a coolant failure increases thermal burden validates direction within the programmed model, not the magnitude or timing of a real coolant fault. Similarly, a test for scenario immutability verifies the state fingerprint boundary exercised by the worker but does not prove that future side effects in new services are isolated.

## 5.6 Determinism and state consistency
Deterministic replay supports repeatable comparisons. Station-specific random streams reduce unintended cross-station coupling in pseudo-random variation. Event IDs derived from stable run and sequence fields make retries recognizable. The reducer tracks sequence state and stores late events without replacing the newest document. The repository adds an event identity uniqueness barrier. These mechanisms address distinct failure modes: random variance, duplicate delivery, stale update, and duplicate persistence.

The repository reports tests that exercise deterministic behavior, duplicate no-op, late-event handling, and strict scenario fork immutability. This makes the system's consistency policy inspectable. Clock synchronization remains an external assumption for delivery latency; the reducer requires timezone-aware timestamps, but does not validate source clock drift against a trusted time server.

## 5.7 Material-flow behavior
Before the material-flow coupling changes, station outputs were not necessarily constrained by upstream supply or downstream capacity. The current implementation adds a sequential production guard and bounded buffer. This supports a conservation relation across the line and allows the UI to show starvation and blocking as derived state.

The simple one-path model is appropriate for demonstrating flow control but cannot represent a full automotive process plan. In a real line, different parts may skip stations, split into branches, join at assembly, re-enter after rework, or consume several component lots. A more general process model would require explicit routing and token transition rules, discrete-event synchronization, buffer capacities by material type, and validation against actual production logs.

## 5.8 Scenario outcomes and interpretation
Scenario results compare a baseline with one or more station overrides from the same snapshot and seed. The implementation returns deltas for output, scrap, quality, energy, health, and bottleneck. A preventive tool-change scenario changes the tool state; a coolant failure scenario introduces a thermal fault; a cadence increase changes cycle-time multipliers and load; an electrode drift scenario explores quality propagation. The presets can reveal model behavior and help structure experiments.

The current project log does not include a saved scenario result dataset or measured result tables. Accordingly, no numeric scenario delta is reported as a result in this chapter. The scenario feature's evidence is functional: request definitions, isolated execution, comparison fields, and tests of directional behavior and immutability. A final empirical submission should export specific saved scenario results with the seed, snapshot ID, horizon, override, software revision, and trace.

## 5.9 Dashboard and operational observability
The interface provides an overview and station views; the production section exposes process sequence, WIP, token status, and defect trace; the system page queries readiness and timing fields; and the event page reads from the event log. The screenshot demonstrates the dark command-center interface and a machine-detail panel. These views connect code-level services to an operator-facing representation.

Operational observability is partly implemented through backend readiness and observed latency fields. The repository does not include an external metrics stack, a log aggregation deployment, distributed tracing, alert rules, or retention policy for observability data. The fields should therefore be considered application instrumentation rather than a complete production observability program.

## 5.10 Deployment results and boundary
The codebase includes Dockerfiles, a complete Docker Compose service topology, broker configuration, and Kubernetes YAML for database, broker, backend, frontend, ingress, namespace, and kustomization. Readiness and liveness probes are represented. The project progress file says container and Kubernetes package implementation is complete, but does not include a deployment execution log.

The conclusion supported by this evidence is that deployment artifacts have been authored and the frontend build and backend tests are recorded as successful. It would be stronger than the evidence permits to state that the platform was deployed in a production cluster, sustained a particular load, or recovered from an outage. Such claims require a reproducible deployment and results.

## 5.11 Limitations of evaluation
There is no calibrated plant dataset, physical hardware connection record, measured MQTT-to-dashboard latency distribution, stress test, high-availability test, or operator usability study in the examined project files. The engineering logs explicitly reserve observability and experiments as further work. The energy equation uses a fixed supply assumption and a modelled current. The station models use reduced-order coefficients without a calibration dataset. The quality model is a simplified score and defect probability rule.

These limitations affect the interpretation, not the existence of the implementation. The thesis can report software architecture, source-level behavior, repository-recorded verification, and model-derived illustrative rates. It cannot claim validated predictive maintenance, real-time guarantees, improved OEE, lower scrap, energy savings, or deployment readiness for a live plant.

## 5.12 Discussion
The most important result is an integrated architecture that keeps separate concerns connected through explicit contracts. This allows the same telemetry definition to support simulation, MQTT, HTTP ingestion, storage, API serialization, and frontend types. It also reduces the risk that scenario execution changes current operating state. The project extends an individual machine twin into a process view with constrained material and traceable tokens.

The architecture has to advance from a prototype to a validated system through evidence. The next research step is not simply to add more dashboard tiles. It is to select a representative machine, collect trustworthy signals, calibrate a small set of equations, define a measurement protocol, compare prediction and observed behavior, measure software timing under defined load, and assess operator use. Security changes are also prerequisites before any external network or control command is introduced.

# Chapter 6 Conclusion and Future Scope

## 6.1 Conclusion
This thesis has presented the design and implementation of a Digital Twin Orchestration Platform for an Industrial IoT manufacturing line. The prototype includes five station models, a versioned event contract, an idempotent and sequence-aware Live Twin reducer, MongoDB and in-memory repositories, a process graph, snapshot capture, constrained production tokens, bottleneck and defect analysis, isolated scenarios, versioned FastAPI routes, a React dashboard, and deployment manifests.

The design responds to the central engineering problem by joining machine state and process state without collapsing them into one service. Simulator observations become events; the Live Twin materializes current state; the Process Twin composes the line; and the Scenario Worker compares isolated futures from a shared snapshot. The bounded material-flow implementation adds starvation and buffer blocking, while token lineage preserves selected upstream quality indicators to inspection.

Repository logs report final backend verification of 48 tests with two skipped, plus a successful frontend production build. The evidence supports the statement that the implemented software paths were exercised according to the project log. It does not demonstrate physical model fidelity, production deployment, or improved manufacturing performance.

## 6.2 Objective attainment
The data contract objective is addressed by strict Pydantic models and mirrored TypeScript types. The deterministic simulation objective is addressed by station-specific reduced-order models with seeded random streams. The synchronization objective is addressed by a reducer that records receive time, computes timing, tracks sequence, and uses event identity. The line-flow objective is addressed by a canonical graph, bounded buffers, starvation checks, tokens, and defect trace. The counterfactual objective is addressed by same-seed baseline and override factories created from a frozen line snapshot, followed by an immutability fingerprint check. The deployment objective is addressed by Docker and Kubernetes files.

Objective attainment should be interpreted at the implementation level. An objective such as "provide deterministic replay" is supported by code and a recorded test name. An objective such as "improve line throughput" would require operational measurement and is not claimed. An objective such as "support real IIoT" remains partly complete because a real industrial adapter, authentication, clock-quality strategy, and safety boundary have not been commissioned.

## 6.3 Limitations
The five stations are model instances rather than documented real assets. Nominal cycle times and physics coefficients are configuration values. The line is serial and single-path. The quality logic is reduced. The broker example allows anonymous connections. Authentication and authorization are absent in the visible application code. The deployment files are not accompanied by a recorded cluster test. The repository does not provide calibrated dataset traces, latency benchmarks, throughput trials, or operator study results.

These constraints mean the command center should be used as a prototype, research demonstrator, or integration starting point. It should not be used as a certified control plane or as evidence of predictive maintenance performance without additional work.

## 6.4 Future work: physical and semantic integration
The first extension is to connect a real machine or a hardware test bench through a dedicated adapter. The adapter should map controller tags to versioned telemetry fields, retain engineering units, preserve source timestamps, report signal quality, and separate measured values from defaults. OPC UA is one possible industrial interface; MQTT may remain useful for event distribution. The implementation should document information-model identifiers and map them to the project contract.

The next extension is calibration. For one station, collect normal and degraded sequences under approved conditions, estimate selected model parameters, reserve separate data for validation, and document uncertainty. Model fit should be assessed against more than average values: trends, fault transients, quality response, and operating-state transitions matter. Changes to parameters should be versioned so scenario outputs can be reproduced.

## 6.5 Future work: empirical system evaluation
A benchmark protocol should specify hardware, operating system, dependency versions, message rate, payload size, number of stations, broker settings, persistence mode, warm-up period, repeated runs, and clock source. It should report median and tail latencies, event loss and duplicate handling, database write rate, API response distribution, browser refresh delay, and recovery behavior. Results should be accompanied by raw traces and scripts.

Model evaluation should compare predicted signals with held-out measured observations and report errors with confidence intervals. Material-flow validation should compare token counts and actual work-in-process against production records. Scenario evaluation should test whether the model ranks interventions correctly, not merely whether it produces an internally consistent delta. Operator evaluation should check whether users can interpret fault, blocking, starvation, and scenario information without confusing simulated estimates with measurements.

## 6.6 Future work: security and reliability
Before network integration, disable anonymous MQTT access, require unique client credentials or certificates, encrypt transport, and apply topic-level authorization. Add user authentication and role-based access for commands and scenario deletion. Restrict CORS origins, validate request authorization, store secrets outside manifests, and define audit retention. Threat modeling should consider malicious telemetry, replay, denial of service, compromised dashboard sessions, and cross-tenant data access.

Reliability work should test broker and database outages, stale data, service restart, duplicate messages, replica failover, storage backup, and restore. Readiness must represent actual dependencies instead of simulator running state alone. Production deployments should use persistent MongoDB storage and an appropriate replica set, resource requests and limits, disruption policies, network policies, TLS, external secrets, and monitoring.

## 6.7 Future work: process and user features
A production-grade process model should represent alternate routes, rework loops, operation setup, batch sizes, mixed product types, explicit arrival and departure events, shift calendars, and resource constraints. Tokens should be linked to product genealogy and inspection outcomes while respecting data retention. Bottleneck analysis should use empirical utilization and event times where available, with status penalties treated as fallback estimates.

The dashboard can add user-configurable alarms, evidence export, scenario comparison history, accessibility refinements, and guided operator workflows. Each visual should carry a clear data provenance label: measured, derived from live state, model-generated, or historical. Usability feedback should shape the interface before the dashboard is deployed on a production floor.

## 6.8 Final statement
The project demonstrates a coherent software architecture for a manufacturing digital twin command center and a repeatable basis for continued engineering. Its strongest results are explicit data and state boundaries, isolated what-if execution, material-flow constraints, and traceable implementation. The next stage is evidence-led integration: connect a bounded physical use case, calibrate and validate the model, quantify software performance, harden security, and evaluate the interface with intended users.

# References
[1] G. Shao and M. Helu, "Framework for a Digital Twin in Manufacturing: Scope and Requirements," Manufacturing Letters, vol. 24, pp. 105-107, 2020. doi: 10.1016/j.mfglet.2020.04.004.

[2] International Organization for Standardization, ISO 23247-2:2021, Automation systems and integration - Digital twin framework for manufacturing - Part 2: Reference architecture, 2021.

[3] E. Negri, L. Fumagalli, and M. Macchi, "A Review of the Roles of Digital Twin in CPS-based Production Systems," Procedia Manufacturing, vol. 11, pp. 939-948, 2017. doi: 10.1016/j.promfg.2017.07.198.

[4] F. Tao, H. Zhang, A. Liu, and A. Y. C. Nee, "Digital Twin in Industry: State-of-the-Art," IEEE Transactions on Industrial Informatics, vol. 15, no. 4, pp. 2405-2415, 2019. doi: 10.1109/TII.2018.2873186.

[5] OASIS, MQTT Version 5.0, OASIS Standard, 7 March 2019. Available: https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html.

[6] OPC Foundation, OPC Unified Architecture Part 1: Overview and Concepts, OPC 10000-1, version 1.05.06. Available: https://reference.opcfoundation.org/specs/OPC-10000-1/full.

[7] G. Shao, D. Kibira, and S. P. Frechette, "Digital Twins for Advanced Manufacturing: The Standardized Approach," in Digital Twins, Simulation, and Metaverse, Springer Nature, 2024.

[8] G. Shao, Use Case Scenarios for Digital Twin Implementation Based on ISO 23247, NIST Advanced Manufacturing Series 400-2, National Institute of Standards and Technology, Gaithersburg, MD, 2021. doi: 10.6028/NIST.AMS.400-2.

# Appendix A Requirements and traceability
## A.1 Functional requirement register
| ID | Requirement | Implementation location | Verification reference |
| FR-01 | Validate versioned telemetry and reject malformed values | domain/contracts.py | Contract and API tests |
| FR-02 | Create deterministic event identity from run, machine, kind, and sequence | domain/contracts.py | Event identity test |
| FR-03 | Materialize current machine state from telemetry | services/live_twin.py | Live Twin reducer tests |
| FR-04 | Preserve state when an older sequence arrives | services/live_twin.py | Late-event preservation test |
| FR-05 | Treat duplicate event identity as an idempotent no-op | repositories and LiveTwinService | Duplicate event test |
| FR-06 | Record event generation and receipt timing | services/live_twin.py | Synchronization state tests |
| FR-07 | Expose the five-station process graph | services/process_twin.py | Topology API test |
| FR-08 | Capture an ordered line snapshot | services/process_twin.py | Snapshot tests |
| FR-09 | Limit downstream starvation and upstream blocking | simulation/causal.py | Material conservation test |
| FR-10 | Track token lineage and inspection disposition | services/process_twin.py | Token progression test |
| FR-11 | Analyze effective bottleneck and station slack | services/process_twin.py | Bottleneck tests |
| FR-12 | Trace defects to carried upstream flags | services/process_twin.py | Defect trace test |
| FR-13 | Run baseline and counterfactual from same snapshot and seed | services/scenario_worker.py | Determinism tests |
| FR-14 | Prevent scenario mutation of Live Twin state | services/scenario_worker.py | Fork immutability test |
| FR-15 | Persist or retrieve scenario results | scenario repositories | Repository CRUD test |
| FR-16 | Provide live-first process and twin views | frontend services and hooks | Frontend build evidence |
| FR-17 | Expose liveness and readiness endpoints | main.py | Health/readiness test |
| FR-18 | Package multi-service deployment resources | Docker and k8s files | Source inspection; cluster execution not recorded |

## A.2 Non-functional requirement register
| ID | Requirement | Evidence or status |
| NFR-01 | Reproducible seeded simulation | Deterministic replay test name in suite |
| NFR-02 | Strict typed boundary data | Pydantic strict models |
| NFR-03 | Bounded metrics and history | Field validators and bounded token/snapshot history |
| NFR-04 | Storage abstraction | In-memory and Mongo repository implementations |
| NFR-05 | Live Twin immutability during scenarios | Fingerprint check and recorded test |
| NFR-06 | Container readiness checks | Compose and Kubernetes probes |
| NFR-07 | Industrial security | Not complete; anonymous MQTT is enabled in example config |
| NFR-08 | Model validation against physical measurements | Not available in repository evidence |
| NFR-09 | Performance and scale measurement | Not available in repository evidence |

## A.3 Acceptance interpretation
Acceptance should be evaluated at the level of each requirement. A source file proves implementation presence; a test shows an intended behavior is executable under its fixture; a recorded test summary gives evidence of a run; a build log supports frontend compilation; a deployment manifest expresses target topology. None of these individually proves physical integration, operational availability, throughput improvement, or cybersecurity. A future project review should attach the exact code revision and test output to each claim.

## A.4 Selected claim-to-evidence map
| Claim area | Evidence included in this thesis | Boundary to preserve |
| Event handling | Versioned contracts, Live Twin service, and named test cases | No field clock-drift validation |
| Material flow | Process Twin implementation and conservation checks | One sequential route only |
| Counterfactuals | Scenario Worker and same-seed immutability checks | Does not establish model fidelity |
| User interface | Screenshot and frontend build record | No operator study or accessibility evaluation |
| Deployment | Compose and Kubernetes resources | No target-cluster execution record |

# Appendix B Data dictionary and topic reference
## B.1 Core event envelope
| Field | Type | Role |
| schema_version | string | Contract revision identifier |
| event_id | string UUID | Stable event identity and duplicate barrier |
| run_id | string | Simulation or acquisition run grouping |
| machine_id | string | Station identity |
| kind | enum | telemetry, state, fault, production, command, or summary |
| sequence | integer | Per-machine monotonic ordering within a run |
| generated_at | UTC timestamp | Producer observation time |
| received_at | optional UTC timestamp | Consumer receipt time; filled by service |
| correlation_id | optional string | Cross-service tracing or request grouping |
| payload | object | Event-kind-specific typed payload |

## B.2 Telemetry signal dictionary
| Signal | Unit or range | Use |
| temperature_c | degrees Celsius | Thermal state |
| vibration_mm_s | mm/s, nonnegative | Mechanical condition proxy |
| current_a | amperes | Electrical load proxy |
| voltage_v | optional volts | Station-specific electrical signal |
| force_kn | optional kN | Press or cutting force |
| hydraulic_pressure_bar | optional bar | Hydraulic signal |
| pneumatic_pressure_bar | optional bar | Pneumatic signal |
| target_rpm / actual_rpm | optional rpm | Commanded and observed/modelled speed |
| cycle_time_s | positive seconds | Current effective cycle signal |
| energy_kwh | nonnegative kWh | Accumulated modeled energy |
| production_count | nonnegative integer | Cumulative completed units |
| wip_count | nonnegative integer | Work-in-process signal |
| is_starved / is_blocked | boolean | Flow constraint indicator |
| health_score | 0-100 | Normalized model health |
| anomaly_score | 0-1 | Normalized model anomaly indicator |
| quality_score | 0-1 | Normalized process quality indicator |
| tool_wear_percent | optional 0-100 | Degradation state |
| bearing_degradation_percent | optional 0-100 | Bearing state |

## B.3 Documented MQTT topic taxonomy
| Topic | Intended payload | Documented delivery |
| factory/v1/{machine_id}/telemetry | Sensor or model telemetry | QoS 0, non-retained |
| factory/v1/{machine_id}/state | State transitions | QoS 1, non-retained |
| factory/v1/{machine_id}/fault | Faults and alarms | QoS 1, retained |
| factory/v1/{machine_id}/production | Part completion | QoS 1, non-retained |
| factory/v1/{machine_id}/command | Operator or system command | QoS 1, non-retained |
| factory/v1/system/summary | Plant summary | QoS 0, non-retained |

The implemented consumer subscribes to factory/v1/+/telemetry. The broader topic list describes the intended taxonomy and should not be mistaken for a guarantee that every event type has a complete production consumer or publisher.

# Appendix C API reference
## C.1 Health and compatibility routes
| Method and route | Purpose |
| GET /health | Process liveness response |
| GET /ready | Simulation and persistence configuration readiness view |
| GET /machines | Current simulator machine telemetry |
| GET /machines/{machine_id} | One simulator machine record |
| GET /machines/{machine_id}/twin | Legacy machine twin state |
| GET /summary | Factory summary |
| GET /simulate/state | Simulator running state |
| POST /simulate/start or /simulate/stop | Start or stop simulation |
| POST /simulate/degrade_cnc or /simulate/reset_cnc | CNC demonstration controls |
| POST /machines/{machine_id}/inject-fault or /reset | Station simulation controls |

## C.2 Versioned twin and event routes
| Method and route | Purpose |
| GET /api/v1/twins | List current twin documents |
| GET /api/v1/twins/{machine_id} | Retrieve one current twin |
| GET /api/v1/twins/{machine_id}/telemetry | Retrieve bounded telemetry history |
| GET /api/v1/events | Retrieve event history with optional machine filter |
| POST /api/v1/events | Controlled telemetry ingestion through shared reducer |

## C.3 Process and token routes
| Method and route | Purpose |
| GET /api/v1/process/topology | Return process nodes and edges |
| GET /api/v1/process/snapshot | Capture an ordered immutable snapshot |
| GET /api/v1/process/view | Return combined process view |
| GET /api/v1/process/bottleneck | Return binding station, cycle, capacity, and slack |
| GET /api/v1/process/tokens | Query tokens with optional filters |
| GET /api/v1/process/tokens/{token_id} | Return token lineage |
| POST /api/v1/process/tokens | Emit a simulated token |
| GET /api/v1/process/defects/trace | Return model-based defect attribution |

## C.4 Scenario routes
| Method and route | Purpose |
| POST /api/v1/scenarios/run | Run a caller-defined counterfactual |
| GET /api/v1/scenarios | List stored scenario results |
| GET /api/v1/scenarios/presets | List available presets |
| POST /api/v1/scenarios/presets/{preset_id}/run | Run one preset with horizon and seed |
| GET /api/v1/scenarios/{scenario_id} | Retrieve detailed scenario result |
| DELETE /api/v1/scenarios/{scenario_id} | Delete a stored scenario result |
| POST /api/v1/scenarios/analyze | Request a decision-oriented scenario summary |
| GET /api/v1/scenarios/strategies | List scenario strategy options |

All mutating routes require security review before production exposure. The API source in this thesis is a catalog; request and response schemas are defined by the Python contract models and OpenAPI description generated by FastAPI.

## C.5 Response and error interpretation
| Condition | Documented behavior | Interpretation |
| Readiness query | Reports simulation and persistence readiness | Represents configured dependencies visible to the service |
| Invalid event envelope | Ingestion rejects invalid data with a client error | Event is not accepted as current state |
| Missing twin, token, or scenario | Resource routes report not found | Identifier is absent from the selected repository |
| Invalid scenario request | Scenario route reports a client error | Review horizon, station override, and request fields |
| Optional analysis unavailable | Analysis route reports service unavailable | Core deterministic simulation does not require that integration |

These responses describe application behavior, not a security boundary. Production access still requires authenticated users, authorization for mutations, protected transport, and audit records.

# Appendix D Scenario and model reference
## D.1 Available scenario presets
| Preset | Intervention represented | Caution |
| cnc_double_speed | CNC cycle-time multiplier 0.50 with elevated load | Increased wear is modelled; not a machine-control setting |
| cnc_parallel_cell | Effective CNC cycle scaling to approximate parallel capacity | Does not add a second node to topology |
| cnc_triple_speed_shift | CNC cycle-time multiplier 0.333 | Intended to explore bottleneck migration |
| line_cadence_derate | CNC cycle-time multiplier 1.25 with lower load | Model hypothesis, not measured energy savings |
| cnc_unplanned_outage | CNC spindle-seizure fault override | Buffer response is simulated |
| preventive_tool_change | CNC tool change and wear reset | Does not model elapsed maintenance time in detail |
| coolant_pump_failure | CNC coolant fault and high-load override | Thermal response depends on reduced-order equations |
| line_cadence_boost | Stamping and CNC cycle-time multiplier 0.80 | Evaluates model trade-off between cadence and wear |
| welding_electrode_drift | Welding wear/fault override | Quality propagation is modelled, not field-calibrated |

## D.2 Station model variables
| Station | Modeled degradation or signals |
| Stamping | Die wear, force, vibration, current, temperature, quality, health |
| CNC | Tool wear, bearing degradation, coolant failure, force, RPM tracking, vibration, current, temperature, quality |
| Welding | Electrode wear, clamp degradation, voltage, current, temperature, quality |
| Inspection | Quality state and inspection-related fault behavior |
| Packaging | Conveyor wear, RPM, current, temperature, vibration, quality |

# Appendix E Deployment and operator guide
## E.1 Local development mode
The backend configuration accepts a persistence backend selection of memory or MongoDB. Memory mode is suitable for quick local inspection and resets with the process. MongoDB mode requires an available database endpoint and should be used when durable records are needed. The MQTT host, port, and enable flag are environment variables. Development should be isolated from any plant network.

The frontend uses configured API and MQTT WebSocket URLs. A user should check the header's backend readiness before interpreting live views. If the backend is offline, the live-first frontend policy should surface the connection failure rather than presenting mock state as current data. The simulator and UI can still be useful for development when using explicit local configuration.

## E.2 Docker Compose topology
The Compose file defines four services: Mosquitto on TCP 1883 and WebSocket 9001, MongoDB on 27017 with a persistent named volume, FastAPI on 8000, and the frontend served on 3000. The backend is configured to use MongoDB and connect to the broker. The frontend receives API and WebSocket URLs as build arguments. Health checks are present for services.

Before a demonstration, verify container image builds, service readiness, MongoDB persistence after restart, broker connection, a telemetry event reaching the Live Twin, event history retrieval, token flow, and one scenario. Save logs with the software revision and configuration. Do not expose example ports to a public network without access controls.

## E.3 Kubernetes topology
The manifest set contains a namespace, config map, MongoDB StatefulSet, Mosquitto deployment, backend deployment, frontend deployment, ingress, and Kustomize entry point. Backend liveness probes use /health and readiness probes use /ready. Database persistence, replica design, secret injection, ingress TLS, resource limits, network policy, service accounts, and observability must be configured for the target cluster.

## E.4 Operator interpretation checklist
1. Confirm the status indicator reports backend readiness.
2. Confirm the selected persistence mode and MQTT connection state.
3. Read station status together with telemetry age and event sequence.
4. Distinguish WIP and buffer constraints from machine faults.
5. Inspect token lineage before interpreting a quality attribution.
6. Treat scenario output as a model comparison from a named snapshot.
7. Do not interpret simulator values as measurements from plant equipment.
8. Escalate physical safety or control actions to approved plant procedures.

## E.5 Configuration and security checklist for future integration
| Area | Required engineering action |
| Broker | Disable anonymous connections; configure TLS, client identities, and topic ACLs |
| API | Add authentication, role-based authorization, origin restrictions, and audit logs |
| Network | Segment OT and IT paths; restrict ingress/egress; document trust boundaries |
| Secrets | Inject credentials from a secret store rather than source-controlled manifests |
| Database | Configure replica set, backup, retention, access control, and restore test |
| Commands | Keep simulator controls separate from machine control; add human approval and safety analysis |
| Observability | Export metrics, logs, and traces with explicit retention and alert ownership |
| Model | Label every field as measured, calculated, or simulated |

# Appendix F Verification catalogue
## F.1 Test names in the source suite
The repository includes test cases with names covering the following behaviors: health and readiness; simulator generation and machine summary; unknown-machine responses; event ingestion and complete twin materialization; invalid event rejection; topology and process endpoints; scenario endpoints; bottleneck analysis; same-seed replay; CNC tool-wear direction; inspection response to upstream quality; tool-change reset; event identity and unobserved receive time; start and stop transitions; positive time-step validation; material-flow conservation; duplicate event idempotency; late-event preservation; machine-ID mismatch rejection; non-telemetry rejection; timezone-aware receipt time; station ordering; telemetry history bounds; repository factory selection; MQTT consumer handling; graph structure; snapshot precondition and frozen semantics; token progression and filtering; nominal and fault-driven bottleneck analysis; defect tracing under CNC degradation; process-view composition; scenario fork immutability; counterfactual health, coolant, and energy direction; preset metadata; scenario repository CRUD; legacy API shape; conservative output; and reset behavior.

## F.2 Verification summary from dated project record
| Date and milestone | Recorded backend test summary | Frontend evidence |
| 2026-09-19 / initial model | 14 tests passed | Not recorded |
| 2026-09-20 / Live Twin | 27 tests passed | Not recorded |
| 2026-09-20 / Process Twin | 37 tests passed | Not recorded |
| 2026-09-20 / Scenario and UI | 45 tests passed | TypeScript and Vite build passed |
| 2026-10-20 / container remediation | 47 tests run; 45 passed and two skipped | Production build passed |
| 2026-10-20 / material-flow redesign | 48 tests run; two skipped, run reported OK | Production build passed |

These are dated entries from the source progress record. Earlier rows are intermediate snapshots, not cumulative counts to be added. The final entry is the relevant recorded summary for the current material-flow implementation.

## F.3 Suggested field evaluation protocol
| Step | Procedure | Output |
| 1 | Select one machine and define sensor points, engineering units, and clock source | Signed signal map |
| 2 | Capture representative normal and degraded data under approved conditions | Versioned, access-controlled dataset |
| 3 | Estimate model parameters on training interval | Parameter file and calibration script |
| 4 | Freeze a separate validation interval | Held-out dataset |
| 5 | Compare predicted and observed signals over aligned timestamps | Error metrics, plots, and uncertainty |
| 6 | Measure end-to-end event path at a fixed event rate and payload size | Latency percentiles, loss and duplicate counts |
| 7 | Repeat under database, broker, and network interruption | Recovery and data integrity report |
| 8 | Conduct operator walkthroughs with simulated data labels | Task completion and usability feedback |

## F.4 Interpretation of software verification evidence
The source suite checks defined behaviors at service and API boundaries. A passing deterministic replay case means that equivalent model inputs and seeds produce equivalent model outputs under that test setup. An idempotency case means a repeated identity did not alter the tested repository state. A material conservation case means the sequential station counters respected the tested ordering. These results support software invariants and regression control.

The final project log reports 48 test cases and two skips, and states that the run completed successfully. It does not provide a full archived test transcript, coverage report, environment fingerprint, or duration for the final run. Earlier milestone counts reflect intermediate versions of the suite and should not be combined. The optional integration tests are skipped when their service dependency is unavailable.

To convert this software verification into a reproducible submission record, attach the source revision, exact command, interpreter and dependency versions, complete test output, and any skip reasons. For a field trial, add raw event traces and calibrated signal comparisons. This evidence would allow an evaluator to distinguish an implementation regression check from a physical-system validation.

# Appendix G Course outcome mapping
The PO and PSO statements are reproduced from the supplied institutional thesis format. The CO-to-PO/PSO values below are a proposed project mapping for review: 1 indicates limited alignment, 2 moderate alignment, and 3 direct alignment. They are not official attainment scores and should be confirmed or replaced by the department before final print.

## G.1 Course outcomes
| Code | Outcome |
| CO1 | Identify and define a complex engineering problem with clear project objectives and scope, considering societal and environmental aspects. |
| CO2 | Apply engineering knowledge, modern tools, and relevant technologies to design, develop, and implement an effective solution or system. |
| CO3 | Analyze and interpret data/results critically to evaluate the performance of the proposed solution using appropriate validation techniques. |
| CO4 | Work effectively as an individual and as a team member, demonstrating professional ethics, communication skills, and project management abilities. |
| CO5 | Prepare and deliver technical documentation and oral presentations with clarity and precision, adhering to engineering standards and practices. |
| CO6 | Reflect on lifelong learning by identifying gaps in knowledge, exploring recent advancements, and proposing further improvements in the project. |

## G.2 CO to PO and PSO matrix
| CO | PO1 | PO2 | PO3 | PO4 | PO5 | PO6 | PO7 | PO8 | PO9 | PO10 | PO11 | PSO1 | PSO2 |
| CO1 | 2 | 3 | 2 | 2 | 1 | 3 | 2 | 1 | 2 | 2 | 2 | 2 | 2 |
| CO2 | 3 | 2 | 3 | 2 | 3 | 2 | 1 | 2 | 1 | 2 | 2 | 3 | 3 |
| CO3 | 2 | 3 | 2 | 3 | 3 | 2 | 1 | 2 | 2 | 2 | 2 | 3 | 3 |
| CO4 | 1 | 1 | 1 | 1 | 1 | 2 | 3 | 3 | 3 | 3 | 2 | 1 | 1 |
| CO5 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 3 | 2 | 2 | 1 | 2 |
| CO6 | 2 | 2 | 2 | 2 | 3 | 2 | 2 | 1 | 2 | 2 | 3 | 3 | 3 |

## G.3 Outcome contribution
The project supports engineering knowledge through a software model and typed contracts; problem analysis through the separation of machine and process concerns; design through a layered platform; investigation through simulation and verification cases; tool use through Python, TypeScript, MQTT, MongoDB, containers, and API tooling; ethical engineering through explicit limits on control and data claims; teamwork through separable interfaces; communication through this thesis and system diagrams; project management through phased delivery; and lifelong learning through a defined plan for calibration, security, and measurement.

# Appendix H Editable submission details
## H.1 Student and guide details
Student names, roll numbers, enrollment numbers, email addresses, contact numbers, guide identity, industry guide identity, and designations are intentionally blank for manual completion. Insert the current approved details and verify spelling and institutional format.

## H.2 Project photographs
Insert current photographs in the boxes below. Use only images approved for submission. Suggested evidence includes a project demonstration view, team photograph, and guide photograph. Do not use the dashboard screenshot as a substitute for a required student or guide photograph.

| Project or team photograph | Insert approved photograph here |
| Student photograph 1 | Insert photograph and name manually |
| Student photograph 2 | Insert photograph and name manually |
| Student photograph 3 | Insert photograph and name manually |
| Student photograph 4 | Insert photograph and name manually |
| Student photograph 5 | Insert photograph and name manually |

## H.3 Guide photograph
| Guide photograph | Insert approved guide photograph here |
| Project demonstration photograph | Insert approved project photograph here |

## H.4 Certificate and publication evidence
Attach patent, copyright, paper acceptance, presentation, or publication certificates only if they exist and are approved for inclusion. No patent or publication evidence was present in the supplied source material.

## H.5 Plagiarism report
Insert the institute-approved plagiarism or similarity report here after the required review. This thesis draft does not claim a similarity score.

## H.6 Poster
Insert the final A3 project poster here after completing the institution's layout and print requirements.

# Appendix I Measurement record templates
## I.1 Event timing log
| Run ID | Machine ID | Event ID | Generated UTC | Received UTC | Delivery latency ms | Processing latency ms | Notes |
| To be recorded | | | | | | | |

## I.2 Model calibration record
| Model version | Station | Parameter | Unit | Estimate | Source interval | Validation metric | Reviewer |
| To be completed | | | | | | | |

## I.3 Scenario experiment record
| Scenario ID | Snapshot ID | Seed | Horizon | Override | Baseline output | Counterfactual output | Quality delta | Energy delta |
| To be recorded | | | | | | | | |

## I.4 Deployment observation record
| Software revision | Environment | Services healthy | Test duration | Event rate | p50 latency | p95 latency | Recovery result |
| To be completed | | | | | | | |

## I.5 Evidence discipline
For each new experiment, retain the raw observation, timestamping method, software revision, configuration, seed, and analysis script. Clearly separate values read from the physical line, values calculated from current state, and values generated by a simulator. Report missing and skipped observations; do not fill gaps with assumed values. A derived capacity should always state its assumptions and formula.

# Appendix J Selected source listings
The selected source listings are included to support traceability of the core implementation. They reproduce repository files and are not a replacement for the version-controlled project. Paths identify their location in the supplied project tree. Source listing page breaks are used for readability.

[[SOURCE:dashboard/backend/domain/contracts.py]]
[[SOURCE:dashboard/backend/simulation/causal.py]]
[[SOURCE:dashboard/backend/services/live_twin.py]]
[[SOURCE:dashboard/backend/services/process_twin.py]]
[[SOURCE:dashboard/backend/services/scenario_worker.py]]
[[SOURCE:dashboard/backend/main.py]]
[[SOURCE:dashboard/backend/tests/test_causal_models.py]]
[[SOURCE:dashboard/backend/tests/test_live_twin.py]]
[[SOURCE:dashboard/backend/tests/test_process_twin.py]]
[[SOURCE:dashboard/backend/tests/test_scenario_worker.py]]
[[SOURCE:dashboard/backend/tests/test_api.py]]

The remaining listings document the repository adapters that support current-state persistence, scenario-result storage, and MQTT-to-reducer transport. These interfaces are included so that the main service behavior can be reviewed together with its persistence and event boundaries.

[[SOURCE:dashboard/backend/repositories/twin_repository.py]]
[[SOURCE:dashboard/backend/repositories/scenario_repository.py]]
[[SOURCE:dashboard/backend/repositories/mongo_scenario_repository.py]]
[[SOURCE:dashboard/backend/services/mqtt_live_twin.py]]
[[SOURCE:dashboard/backend/repositories/mongo_twin_repository.py]]
[[SOURCE:dashboard/backend/repositories/factory.py]]
[[SOURCE:dashboard/backend/config.py]]
