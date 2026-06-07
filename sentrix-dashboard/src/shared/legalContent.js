export const LEGAL_CONTENT = {
  TERMS: {
    title: "Terms & Conditions",
    sections: [
      {
        heading: "Authorized Use",
        content: "Sentrix is designed for authorized network administration and laboratory monitoring. By accessing this console, you represent that you have the legal authority to monitor the devices registered to this instance."
      },
      {
        heading: "No Warranty (As-Is)",
        content: "Sentrix is provided \"as is\" without any warranty of any kind. While we strive for 100% uptime and accurate reporting, the developers are not liable for any data loss, hardware damage, or system downtime resulting from the use of the Sentrix Core or Agent."
      },
      {
        heading: "Usage Restrictions",
        content: "Users are prohibited from: Attempting to bypass the Network Access Control (NAC) or automated banning systems; reverse engineering the Sentrix Agent or Core services; or using the system for unauthorized surveillance of individuals rather than technical assets."
      },
      {
        heading: "Intellectual Property",
        content: "All software, designs, and logos associated with Sentrix are the property of the project developers."
      }
    ]
  },
  PRIVACY: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "Data Collection",
        content: "The Sentrix Agent collects technical data from managed endpoints, including hardware specs (CPU, RAM, GPU, Disk), peripheral activity logs (USB/HID), installed software inventory, and system health metrics."
      },
      {
        heading: "Data Purpose",
        content: "Data is collected exclusively for real-time health monitoring, hardware/software inventory management, and security auditing through the Peripheral and Audit logs."
      },
      {
        heading: "Data Sovereignty & Storage",
        content: "All collected data is stored locally on your sentrix-core server. No data is transmitted to external servers or third-party providers. You own your data."
      },
      {
        heading: "Agent Behavior",
        content: "The agent runs as a SYSTEM service to collect technical metrics and does not record screen content, keystrokes, or personal files."
      }
    ]
  }
};
