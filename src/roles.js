/* ============================================================================
   roles.js — the interview tracks Interview Lab can simulate.
   ----------------------------------------------------------------------------
   Each role maps to a cert/job in the wider study-platform ecosystem and
   carries the material the interviewer needs:

     focus[]          — areas a good interviewer should cover / probe
     technicalSeeds[] — real, entry-level technical questions for that role

   The seed banks matter because they let the zero-setup SIMULATION engine run
   a coherent, role-appropriate interview with no model loaded. When a real
   model (WebLLM / Ollama) is connected, the interviewer improvises instead and
   only borrows these as inspiration.

   `icon` is a lucide-react component name, resolved in App.jsx.
   ============================================================================ */

/* Behavioural questions are role-independent — the classic bank every
   interviewer draws from. Flavoured lightly per role by the model when live. */
export const BEHAVIORAL_SEEDS = [
  "Tell me about yourself and what draws you to this role.",
  "Tell me about a time you had to learn a new technology quickly. How did you approach it?",
  "Describe a situation where you disagreed with a teammate. How did you handle it?",
  "Tell me about a mistake you made on a project. What did you do about it?",
  "Give me an example of a time you explained something technical to a non-technical person.",
  "Describe a time you were under pressure with a tight deadline. How did you cope?",
  "Tell me about a time you went above and beyond for a customer or user.",
  "Tell me about a time you had to juggle several priorities at once. How did you decide what came first?",
  "Describe a time you received tough feedback. What did you change afterwards?",
  "Walk me through a project you're proud of. What was your specific contribution?",
];

export const ROLES = [
  {
    id: "soc-analyst",
    name: "SOC Analyst (Tier 1)",
    cert: "Security+ / CySA+",
    icon: "ShieldAlert",
    blurb: "Triage alerts, investigate incidents, and escalate inside a security operations center.",
    focus: [
      "alert triage",
      "SIEM & log analysis",
      "indicators of compromise",
      "incident response steps",
      "escalation & communication",
      "MITRE ATT&CK",
    ],
    technicalSeeds: [
      "Walk me through what you'd do when a SIEM alert fires for a possible brute-force login on a public-facing server.",
      "How do you tell a true positive from a false positive when you're triaging alerts?",
      "What's the difference between an IDS and an IPS, and why does it matter to you as an analyst?",
      "A user reports their machine is slow and popping up ads. How do you investigate whether it's malware?",
      "What would you look for in firewall or proxy logs to spot data being exfiltrated?",
    ],
  },
  {
    id: "help-desk",
    name: "Help Desk / IT Support",
    cert: "A+",
    icon: "Headphones",
    blurb: "First line of support: troubleshoot, fix, and keep frustrated users calm.",
    focus: [
      "structured troubleshooting",
      "customer service & empathy",
      "hardware & operating systems",
      "ticketing & documentation",
      "knowing when to escalate",
    ],
    technicalSeeds: [
      "A user says their computer won't turn on. Walk me through your troubleshooting steps.",
      "What's the difference between RAM and storage, and why would a user care?",
      "A customer is angry and blaming you for a printer that won't work. How do you handle the call?",
      "How would you explain the difference between an IP address and a MAC address to a brand-new hire?",
      "Someone can't get on Wi-Fi with their laptop, but their phone connects fine. Where do you start?",
    ],
  },
  {
    id: "network-tech",
    name: "Network Technician",
    cert: "Network+",
    icon: "Network",
    blurb: "Keep connectivity flowing: cabling, switching, routing, and diagnosis.",
    focus: [
      "TCP/IP fundamentals",
      "subnetting & addressing",
      "routing vs switching",
      "connectivity troubleshooting",
      "common ports & protocols",
    ],
    technicalSeeds: [
      "A user can reach internal sites but not the internet. How do you troubleshoot it?",
      "Explain the difference between TCP and UDP and give me an example of each.",
      "What does subnetting actually do, and why would a company bother subnetting its network?",
      "Walk me through, step by step, what happens when you type a URL and press Enter.",
      "How would you use ping and traceroute together to isolate where a connection is failing?",
    ],
  },
  {
    id: "sysadmin",
    name: "Systems Administrator",
    cert: "Server+ / Linux+",
    icon: "Server",
    blurb: "Keep servers healthy: users, storage, backups, and the command line.",
    focus: [
      "Linux command line",
      "backups & recovery",
      "service & process management",
      "permissions & accounts",
      "performance troubleshooting",
    ],
    technicalSeeds: [
      "How would you find what's eating all the disk space on a Linux server?",
      "Explain the difference between a full, an incremental, and a differential backup.",
      "A service won't start after a reboot. How do you diagnose it on Linux?",
      "What do Linux file permissions mean, and how does chmod 750 differ from 755?",
      "How do you check which processes are consuming the most CPU or memory?",
    ],
  },
  {
    id: "cloud-admin",
    name: "Cloud Administrator",
    cert: "Cloud+",
    icon: "Cloud",
    blurb: "Provision and run workloads in the cloud: identity, scaling, and cost.",
    focus: [
      "IaaS / PaaS / SaaS models",
      "identity & least privilege",
      "scaling & high availability",
      "cost awareness",
      "shared-responsibility model",
    ],
    technicalSeeds: [
      "What's the difference between vertical and horizontal scaling, and when would you use each?",
      "Explain IAM roles versus users, and why least privilege matters.",
      "A cloud bill spikes unexpectedly. How would you investigate the cause?",
      "What's the difference between IaaS, PaaS, and SaaS? Give me an example of each.",
      "How would you design a workload to stay available if an availability zone goes down?",
    ],
  },
  {
    id: "pentester",
    name: "Junior Penetration Tester",
    cert: "PenTest+",
    icon: "Crosshair",
    blurb: "Find weaknesses ethically: scope, recon, exploit, and report.",
    focus: [
      "scoping & rules of engagement",
      "recon & enumeration",
      "exploitation & impact",
      "professional ethics",
      "clear reporting",
    ],
    technicalSeeds: [
      "Before any testing starts, what needs to be established with the client, and why?",
      "Walk me through the phases of a penetration test at a high level.",
      "You've found a SQL injection point. How do you demonstrate impact responsibly?",
      "What's the difference between a vulnerability scan and a penetration test?",
      "During an engagement you find evidence of a real prior breach. What do you do?",
    ],
  },
  {
    id: "grc-analyst",
    name: "GRC / IT Auditor",
    cert: "CISA / CISM",
    icon: "ClipboardCheck",
    blurb: "Governance, risk, and audit: controls, frameworks, and evidence.",
    focus: [
      "risk vs threat vs vulnerability",
      "control frameworks (NIST, ISO 27001)",
      "gathering audit evidence",
      "risk assessment & prioritization",
      "separation of duties",
    ],
    technicalSeeds: [
      "What's the difference between a risk, a threat, and a vulnerability?",
      "How would you explain the purpose of a control framework like NIST or ISO 27001?",
      "What evidence would you collect to test whether access reviews are actually happening?",
      "Walk me through how you'd assess and prioritize risks for a small company.",
      "What is separation of duties, and why does an auditor care about it?",
    ],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    cert: "Data+",
    icon: "BarChart3",
    blurb: "Turn messy data into clear answers: SQL, stats, and visualization.",
    focus: [
      "data cleaning & preparation",
      "descriptive statistics",
      "choosing the right chart",
      "SQL querying",
      "correlation vs causation",
    ],
    technicalSeeds: [
      "Walk me through how you'd clean a messy dataset before any analysis.",
      "What's the difference between a mean and a median, and when is the median more useful?",
      "How would you decide which chart type best communicates a given finding?",
      "Explain the difference between correlation and causation with an example.",
      "Given a SQL table of orders, how would you find the top five customers by revenue?",
    ],
  },
];

export function getRole(id) {
  return ROLES.find((r) => r.id === id) || ROLES[0];
}
