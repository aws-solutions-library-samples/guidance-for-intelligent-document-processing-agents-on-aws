import React, { forwardRef } from 'react';
import { ButtonGroup, StatusIndicator } from "@cloudscape-design/components"
import{ Avatar } from "@cloudscape-design/chat-components";
import { AuthorAvatarProps } from '../utils/config';

export function ChatBubbleAvatar({ type, name, initials, loading }: AuthorAvatarProps) {
  if (type === 'gen-ai') {
    return <Avatar color="gen-ai" iconName="gen-ai" tooltipText={name} ariaLabel={name} loading={loading} />;
  }

  return <Avatar initials={initials} tooltipText={name} ariaLabel={name} />;
}

export function CodeViewActions({ content }: { content: string }) {
  return (
    <ButtonGroup
      variant="icon"
      onItemClick={({ detail }) => {
        if (detail.id !== 'copy' || !navigator.clipboard) {
          return;
        }

        // eslint-disable-next-line no-console
        navigator.clipboard.writeText(content).catch(error => console.log('Failed to copy', error.message));
      }}
      items={[
        {
          type: 'group',
          text: 'Feedback',
          items: [
            {
              type: 'icon-button',
              id: 'run-command',
              iconName: 'play',
              text: 'Run command',
            },
            {
              type: 'icon-button',
              id: 'send-cloudshell',
              iconName: 'script',
              text: 'Send to IDE',
            },
          ],
        },
        {
          type: 'icon-button',
          id: 'copy',
          iconName: 'copy',
          text: 'Copy',
          popoverFeedback: <StatusIndicator type="success">Message copied</StatusIndicator>,
        },
      ]}
    />
  );
}

export function Actions() {
  return (
    <ButtonGroup
      variant="icon"
      onItemClick={() => void 0}
      items={[
        {
          type: 'icon-button',
          id: 'copy',
          iconName: 'copy',
          text: 'Copy',
          popoverFeedback: <StatusIndicator type="success">Message copied</StatusIndicator>,
        },
      ]}
    />
  );
}

export const FittedContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div style={{ position: 'relative', flexGrow: 1, height: '100%' }}>
      <div style={{ position: 'absolute', inset: 0, height: '100%' }}>{children}</div>
    </div>
  );
};

export const ScrollableContainer = forwardRef(function ScrollableContainer(
  { children }: { children: React.ReactNode },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <div style={{ position: 'relative', blockSize: '93%' }}>
      <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }} ref={ref} data-testid="chat-scroll-container">
        {children}
      </div>
    </div>
  );
});
