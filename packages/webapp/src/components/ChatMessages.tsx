import { useCallback, useEffect, useState, Fragment } from "react";
import { Box, SpaceBetween, Spinner, Icon, TextContent } from "@cloudscape-design/components";
import { ChatBubble } from "@cloudscape-design/chat-components";
import { ChatBubbleAvatar } from './ChatCommon';
import { AUTHORS } from '../utils/config';
import { DocumentType } from '../utils/types';
import { useAtomValue } from "jotai";
import { authedUserAtom } from "../atoms/AppAtoms";
import { generateClient } from "aws-amplify/api";
import { useListChatsByUser } from "../hooks/useApi";
import { onChatByUserId } from "../graphql/subscriptions";
import '../styles/chat.scss';

const getFileType = (fileName: string): 'pdf' | 'image' | 'unknown' => {
    const extension = fileName.toLowerCase().split('.').pop();
    if (extension === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif'].includes(extension || '')) return 'image';
    return 'unknown';
};

interface ChatMessagesProps {
    onNewMessage: () => void;
    agentFlowRef: React.RefObject<any>;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ onNewMessage, agentFlowRef }) => {
    const client = generateClient();
    const authedUser = useAtomValue(authedUserAtom);
    const { data: chats, refetch, isFetched } = useListChatsByUser(authedUser?.userID ?? "");
    const [isAIResponding, setIsAIResponding] = useState(false);

    useEffect(() => {
        if (chats && chats.length > 0) {
            const lastChat = chats[chats.length - 1];
            if (lastChat.human && !lastChat.bot) {
                setIsAIResponding(true);
                setTimeout(() => {
                    onNewMessage?.();
                }, 100);
            } else if (lastChat.bot) {
                setIsAIResponding(false);
                onNewMessage?.();
            }
        }
    }, [chats, onNewMessage]);

    const handleTraceUpdate = useCallback((trace: any, chatData?: any) => {
        console.log('Processing trace:', trace);
        
        const traceEntry = {
            timestamp: new Date().toISOString(),
            text: trace?.content?.text || ''
        };
    
        // Handle the very first call with flag check
        if (trace?.content?.action === 'modelInvocationInput' && !trace?.content?.collaboratorName) {
            console.log('First call detected');
            if (trace?.content?.text) {
                agentFlowRef.current?.addNodeTrace('supervisor', traceEntry);
            }
            // Show first call animation
            agentFlowRef.current?.updateEdgeAnimation('e-user-supervisor', true);
            
            // Start continuous response animation
            agentFlowRef.current?.updateEdgeAnimation('e-supervisor-response', true);
            
            setTimeout(() => {
                agentFlowRef.current?.updateEdgeAnimation('e-user-supervisor', false);
            }, 2000);
        }
        // Handle modelInvocationOutput with collaborator
        else if (trace?.content?.action === 'modelInvocationOutput' && trace?.content?.collaboratorName) {
            const nodeId = trace.content.collaboratorName === 'loan_application_assistant_agent' ? 'loanApplicant' : 'broker';
            if (trace?.content?.text) {
                agentFlowRef.current?.addNodeTrace(nodeId, traceEntry);
            }
            
            // Increment counter and show animation
            agentFlowRef.current?.incrementEdgeCount(`e-supervisor-${nodeId}`);
            agentFlowRef.current?.updateEdgeAnimation(`e-supervisor-${nodeId}`, true);
            setTimeout(() => {
                agentFlowRef.current?.updateEdgeAnimation(`e-supervisor-${nodeId}`, false);
            }, 2000);
        }
        // Handle modelInvocationOutput without collaborator
        else if (trace?.content?.action === 'modelInvocationOutput' && !trace?.content?.collaboratorName) {
            if (trace?.content?.text) {
                agentFlowRef.current?.addNodeTrace('supervisor', traceEntry);
            }
        }
        // Handle final response - stop animations when we get bot response
        if (chatData?.onChatByUserId?.bot) {
            const responseTrace = {
                timestamp: new Date().toISOString(),
                text: chatData.onChatByUserId.bot
            };
            agentFlowRef.current?.addNodeTrace('response', responseTrace);
            setTimeout(() => {
                agentFlowRef.current?.updateEdgeAnimation('e-supervisor-response', false);
            }, 2000);
        }
    }, [agentFlowRef]);

    const setupSubscription = useCallback(() => {
        console.log("Setting up chat subscription");
        const subscription = client
            .graphql({
                query: onChatByUserId,
                variables: { userID: authedUser?.userID ?? "" }
            })
            .subscribe({
                next: ({ data }) => {
                    console.log("New chat message received:", data);
                    // Process trace data from subscription
                    if (data?.onChatByUserId?.payload) {
                        try {
                            const parsedPayload = JSON.parse(data.onChatByUserId.payload);
                            
                            if (parsedPayload.trace) {
                                handleTraceUpdate(parsedPayload.trace, data); 
                            } else if (data.onChatByUserId.bot) {
                                // Handle case where we have a bot response but no trace
                                handleTraceUpdate(null, data);
                            }
                        } catch (error) {
                            console.error("Error processing chat payload:", error);
                        }
                    }
                    
                    refetch();
                    onNewMessage();
                },
                error: (error) => console.error("Subscription error:", error)
            });

        return subscription;
    }, [authedUser?.userID, refetch, onNewMessage, handleTraceUpdate]);

    useEffect(() => {
        const subscription = setupSubscription();
        return () => {
            console.log("Cleaning up chat subscription");
            subscription?.unsubscribe();
        };
    }, [setupSubscription]);

    const renderDocumentPreview = (doc: { id: string; title: string; imageUrl: string }) => {
        const fileType = getFileType(doc.id);
        if (fileType === 'pdf') {
            return (
                <Box
                    key={doc.id}
                    margin={{ top: 'xs' }}
                >
                    <Icon
                        size="normal"
                        variant="error"
                    />
                    <Box margin={{ left: 'xs' }}>
                        <a
                            href={doc.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: 'inherit',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {doc.title}
                            <Icon
                                name="external"
                                size="small"
                            />
                        </a>
                    </Box>
                </Box>
            );
        }

        return (
            <Box
                key={doc.id}
                margin={{ top: 'xs' }}
            >
                <img
                    src={doc.imageUrl}
                    alt={doc.title}
                    style={{
                        width: '30px',
                        height: '30px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        marginRight: '8px',
                        cursor: 'pointer'
                    }}
                    onClick={() => {
                        window.open(doc.imageUrl, '_blank');
                    }}
                />
                <span>{doc.title}</span>
            </Box>
        );
    };

    const groupedMessages = chats?.reduce((acc, chat) => {
        if (chat.human) {
            acc.push({
                id: chat.id,
                human: chat.human,
                bot: chat.bot,
                payload: chat.payload,
                timestamp: chat.createdAt
            });
        }
        return acc;
    }, [] as any[]);

    return (
        <Box padding="s">
            {groupedMessages?.map((chat, index) => (
                <Box key={`conversation-${chat.id}-${index}`}>
                    <SpaceBetween size="xs">
                        <ChatBubble
                            key={`user-message-${chat.id}`}
                            ariaLabel="User message"
                            type="outgoing"
                            avatar={
                                <ChatBubbleAvatar
                                    type="user"
                                    name={AUTHORS['user-jane-doe'].name}
                                    initials={AUTHORS['user-jane-doe'].initials}
                                />
                            }
                        >
                            <Box>
                                <Box>{chat.human}</Box>
                                {chat.payload && JSON.parse(chat.payload).documents?.length > 0 && (
                                    <Box
                                        margin={{ top: 's' }}
                                        padding="s"
                                    >
                                        <Box fontWeight="bold" padding={{ bottom: 'xs' }}>
                                            Attached Documents:
                                        </Box>
                                        <SpaceBetween direction="vertical" size="xs">
                                            {JSON.parse(chat.payload).documents?.map((doc: DocumentType, docIndex: number) => (
                                                <Box key={`doc-${chat.id}-${doc.id}-${docIndex}`}>  {/* Added unique key here */}
                                                    {renderDocumentPreview(doc)}
                                                </Box>
                                            ))}
                                        </SpaceBetween>
                                    </Box>
                                )}
                            </Box>
                        </ChatBubble>

                        {(chat.bot || (isAIResponding && index === groupedMessages.length - 1)) && (
                            <ChatBubble
                                key={`ai-response-${chat.id}`}
                                ariaLabel="AI response"
                                type="incoming"
                                avatar={
                                    <ChatBubbleAvatar
                                        type="gen-ai"
                                        name={AUTHORS['gen-ai'].name}
                                        initials={AUTHORS['gen-ai'].initials}
                                    />
                                }
                            >
                                <Box>
                                    {isAIResponding && !chat.bot ? (
                                        <Box>
                                            Generating response... <Spinner size="normal" />
                                        </Box>
                                    ) : (
                                        <TextContent>
                                            {chat.bot?.split('\n\n').map((paragraph: string, index: number) => (
                                                <p key={index}>
                                                    {paragraph.split('\n').map((line, lineIndex) => (
                                                        <Fragment key={lineIndex}>
                                                            {line}
                                                            {lineIndex < paragraph.split('\n').length - 1 && <br />}
                                                        </Fragment>
                                                    ))}
                                                </p>
                                            ))}
                                        </TextContent>
                                    )}
                                </Box>
                            </ChatBubble>
                        )}
                    </SpaceBetween>
                </Box>
            ))}
        </Box>
    );
};
