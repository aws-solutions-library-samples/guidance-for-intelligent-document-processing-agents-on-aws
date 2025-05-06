import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import '../styles/CustomAgentNode.css';

interface CustomAgentNodeProps {
  data: {
    label: string;
    borderColor?: string;
    isProcessing?: boolean;
    processingComplete?: boolean;
    style?: React.CSSProperties;
    text?: string; 
  };
}

const CustomAgentNode: React.FC<CustomAgentNodeProps> = ({ data }) => {
  const handleStyle = {
    background: data.borderColor || '#1a192b',
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  };

  return (
    <div
      className={`custom-agent-node ${data.isProcessing ? 'processing' : ''} ${
        data.processingComplete ? 'complete' : ''
      }`}
      style={{
        borderColor: data.borderColor || '#1a192b',
        ...(data.style || {})
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top}
        style={handleStyle}
      />
      <div className="node-content">
        <div className="node-label">{data.label}</div>
        {data.text && (
          <div className="node-text">
            {data.text}
          </div>
        )}
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom}
        style={handleStyle}
      />
    </div>
  );
};

export default memo(CustomAgentNode);
