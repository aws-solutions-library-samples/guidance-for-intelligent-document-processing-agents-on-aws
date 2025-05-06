import { Node as ReactFlowNode, Edge } from 'reactflow';
import { bedrockColors } from './BedrockTheme';

type NodeType = 'supervisor' | 'loanApplicant' | 'broker' | 'user' | 'response';

// Define custom node data structure
interface CustomNodeData {
    label: string;
    borderColor?: string;
    isProcessing?: boolean;
    processingComplete?: boolean;
}

// Define custom node type
export type CustomNode = ReactFlowNode<CustomNodeData>;

export const createInitialLoanNodes = (): CustomNode[] => [
  {
    id: 'user',
    type: 'customAgent',
    position: { x: 400, y: 0 },
    data: {
      label: 'User',
      borderColor: bedrockColors.primary
    }
  },
  {
    id: 'supervisor',
    type: 'customAgent',
    position: { x: 400, y: 150 },
    data: {
      label: 'Supervisor',
      borderColor: bedrockColors.error
    }
  },
  {
    id: 'loanApplicant',
    type: 'customAgent',
    position: { x: 200, y: 300 },
    data: {
      label: 'Loan Applicant Agent',
      borderColor: bedrockColors.success
    }
  },
  {
    id: 'broker',
    type: 'customAgent',
    position: { x: 600, y: 300 },
    data: {
      label: 'Broker Agent',
      borderColor: bedrockColors.warning
    }
  },
  {
    id: 'response',
    type: 'customAgent',
    position: { x: 400, y: 450 },
    data: {
      label: 'Response',
      borderColor: bedrockColors.teal
    }
  }
];

export const createInitialLoanEdges = (): Edge[] => [
  {
    id: 'e-user-supervisor',
    source: 'user',
    target: 'supervisor',
    type: 'smoothstep',
    animated: false,
    style: { stroke: bedrockColors.primary }
  },
  {
    id: 'e-supervisor-loanApplicant',
    source: 'supervisor',
    target: 'loanApplicant',
    type: 'smoothstep',
    animated: false,
    style: { stroke: bedrockColors.success }
  },
  {
    id: 'e-supervisor-broker',
    source: 'supervisor',
    target: 'broker',
    type: 'smoothstep',
    animated: false,
    style: { stroke: bedrockColors.warning }
  },
  {
    id: 'e-supervisor-response',
    source: 'supervisor',
    target: 'response',
    type: 'smoothstep',
    animated: false,
    style: { stroke: bedrockColors.teal }
  }
];

export const loanNodeDetailsMap: Record<NodeType, {
    title: string;
    description: string;
    details: string;
  }> = {
    'supervisor': {
      title: 'Loan Processing Supervisor',
      description: 'Coordinates the loan application process and manages specialized agents.',
      details: 'This agent evaluates user queries, directs requests to appropriate specialized agents, and synthesizes responses to provide comprehensive loan application assistance.'
    },
    'loanApplicant': {
      title: 'Loan Application Assistant Agent',
      description: 'Specializes in applicant evaluation and document verification.',
      details: 'Handles document verification, credit assessment, income validation, and eligibility checking. Ensures all applicant information meets lending requirements and compliance standards.'
    },
    'broker': {
      title: 'Broker Agent',
      description: 'Manages loan products, rates, and application processing.',
      details: 'Evaluates loan options, provides rate information, explains terms and conditions, and facilitates the application process. Ensures optimal loan product matching based on applicant profile.'
    },
    'user': {
      title: 'User',
      description: 'Loan applicant or inquirer seeking assistance.',
      details: 'The end user who interacts with the system to get information about loans, submit applications, or check application status.'
    },
    'response': {
      title: 'Response to User',
      description: 'Final processed response to the user query.',
      details: 'Synthesized information from all relevant agents, providing clear and actionable loan-related guidance or updates.'
    }
};
