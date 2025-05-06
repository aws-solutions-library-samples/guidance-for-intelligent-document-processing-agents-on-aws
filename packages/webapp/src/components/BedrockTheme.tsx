// AWS Bedrock inspired color palette
export const bedrockColors = {
  primary: '#006ce0',      // AWS blue
  secondary: '#232b37',    // Dark gray/blue
  success: '#008559',      // Green
  warning: '#fa6f00',      // Orange
  error: '#d14600',        // Red
  purple: '#6842ff',       // Purple
  pink: '#d600ba',         // Pink
  teal: '#00a4bd',         // Teal
  lightBlue: '#0099ff',    // Light blue
  background: '#ffffff',   // White
  border: '#dedee3',       // Light gray
  text: '#161d26',         // Dark text
  lightText: '#72747e'     // Light text
};

// Node-specific colors
export const nodeColors = {
  // Core flow nodes
  user: bedrockColors.primary,          // Blue for user
  supervisor: bedrockColors.purple,      // Purple for supervisor
  loanApplicant: bedrockColors.success, // Green for loan applicant agent
  broker: bedrockColors.warning,        // Orange for broker agent
  response: bedrockColors.teal          // Teal for response
};
