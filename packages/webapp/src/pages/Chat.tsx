import { useRef, useState, useCallback, useEffect } from 'react';
import { Container, Box, FormField, Header, Link, PromptInput, Modal, Button, SpaceBetween, ExpandableSection, SplitPanel } from "@cloudscape-design/components";
import { SupportPromptGroup } from "@cloudscape-design/chat-components";
import { FittedContainer, ScrollableContainer } from '../components/ChatCommon';
import { DocumentType } from "../utils/types";
import { ChatMessages } from '../components/ChatMessages';
import { ImageCards } from '../components/ImageCards';
import { useAtom, useAtomValue } from "jotai";
import { selectionAtom } from "../atoms/WizardAtoms";
import { useMutation } from "@tanstack/react-query";
import { addChat, removeChat, appsyncResolver, useListChatsByUser } from "../hooks/useApi";
import { authedUserAtom } from "../atoms/AppAtoms";
import { bedrockColors } from "../components/BedrockTheme";
import AgentFlowPanel from "../components/AgentFlowPanel";
import { loanNodeDetailsMap, createInitialLoanNodes, createInitialLoanEdges } from "../components/AgentFlowNodeConfig";

import ChatLogo from "../assets/chat_logo.png"
import '../styles/chat.scss';

export const Chat = () => {
    const [prompt, setPrompt] = useState('');
    const [isGenAiResponseLoading, setIsGenAiResponseLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [selectedDocuments, setSelectedDocuments] = useState<DocumentType[]>([]);
    const authedUser = useAtomValue(authedUserAtom);
    const { data: chats, refetch } = useListChatsByUser(authedUser?.userID ?? "");
    const [selection, setSelection] = useAtom(selectionAtom);
    const agentFlowRef = useRef<any>(null);

    const handleUserMessage = () => {
        // Tell AgentFlowPanel to animate User -> Supervisor flow
        agentFlowRef.current?.updateEdgeAnimation('e-user-supervisor', true);
        agentFlowRef.current?.incrementEdgeCount('e-user-supervisor');

        setTimeout(() => {
            agentFlowRef.current?.updateEdgeAnimation('e-user-supervisor', false);
        }, 2000);
    };
    
    const promptItems = [
        { text: "Start my application", id: "start" },
        { text: "Upload my driver's license", id: "license" },
        { text: "Upload my W2", id: "w2" },
        { text: "Upload bank statement", id: "bank" },
        { text: "Submit my application", id: "submit" }
    ];
    
    const handleScrollToEnd = useCallback(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, []);

    const deleteChatMutation = useMutation({
        mutationFn: (id: string) => removeChat(id),
    });

    const handleEndSessionAndClear = async () => {
        // First send the end_session message
        try {
            if (!chats) return;

            if (authedUser?.userID) {
                const payload = {
                    opr: "chat",
                    userID: authedUser.userID,
                    message: 'end_session',
                    documents: []
                };
                await appsyncResolver(JSON.stringify(payload));
            }
    
            chats.forEach(chat => {
                deleteChatMutation.mutate(chat.id, {
                    onSuccess: (data) => {
                        console.log("Chat deleted:", data);
                    },
                    onError: (error) => {
                        console.error("Delete chat error:", error);
                    },
                    onSettled: () => {
                        refetch();
                    }
                });
            });
        } catch (error) {
            console.error("Error ending session:", error);
        }
    };

    const handleQuickAction = (action: string) => {
        switch (action) {
            case 'start':
                setPrompt('Start my application');
                onPromptSend({ detail: { value: 'Start my application' } });
                break;
            case 'license':
            case 'w2':
            case 'bank':
                handleModalOpen();
                break;
            case 'submit':
                setPrompt('Submit my application');
                onPromptSend({ detail: { value: 'Submit my application' } });
                break;
        }
    };

    const createChatMutation = useMutation({
        mutationFn: async () => {
            console.log("Creating chat with:", {
                userID: authedUser?.userID,
                message: prompt,
                documents: selectedDocuments
            });
            if (authedUser) {
                try {
                    const result = await addChat({
                        userID: authedUser.userID,
                        message: prompt,
                        documents: selectedDocuments
                    });
                    console.log("Chat creation result:", result);
                    return result;
                } catch (error) {
                    console.error("Chat creation error:", error);
                    throw error;
                }
            }
        },
        onMutate: () => {
            console.log("createChatMutation onMutate");
            setIsGenAiResponseLoading(true);
            handleScrollToEnd();
        },
        onSuccess: async (response) => {
            console.log("createChatMutation onSuccess");
            setPrompt('');
            setSelectedDocuments([]);
            if (response?.data.createChat) {
                const payload = {
                    opr: "chat",
                    id: response.data.createChat.id,
                    userID: response.data.createChat.userID,
                    message: prompt,
                    documents: selectedDocuments
                };
                console.log("Calling AI response with:", payload);
                generateResponseMutation.mutate(JSON.stringify(payload));
            }
        },
        onSettled: () => {
            console.log("createChatMutation onSettled");
            handleScrollToEnd();
        },
        onError: (error) => {
            console.error("Chat mutation error:", error);
            setIsGenAiResponseLoading(false);
        }
    });

    const generateResponseMutation = useMutation({
        mutationFn: (args: string) => {
            console.log("Generating AI response with:", args);
            return appsyncResolver(args);
        },
        onSuccess: () => {
            setIsGenAiResponseLoading(false);
            handleScrollToEnd();
        },
        onSettled: () => {
            handleScrollToEnd(); 
        },
        onError: (error) => {
            console.error("Generate response error:", error);
            setIsGenAiResponseLoading(false);
        }
    });

    const handleModalOpen = () => setIsModalVisible(true);
    const handleModalClose = () => setIsModalVisible(false);

    const handleModalSubmit = () => {
        if (selection?.selectedDocs && selection.selectedDocs.length > 0) {
            setSelectedDocuments(selection.selectedDocs);
        }
        setSelection({
            selectedDocs: []
        });
        setIsModalVisible(false);
    };

    const onPromptSend = ({ detail: { value } }: { detail: { value: string } }) => {
        if (isGenAiResponseLoading) return;
        
        // Allow sending if either message or documents exist
        if (!value && (!selectedDocuments || selectedDocuments.length === 0)) return;
        const messageToSend = value || " ";
        
        console.log("onPromptSend triggered with:", {
            message: messageToSend,
            documents: selectedDocuments
        });

        setPrompt(messageToSend);
        setIsGenAiResponseLoading(true);
        createChatMutation.mutate();

        handleUserMessage();
    };

    return (
        <div className="chat-container">
            <FittedContainer>
                <Container
                    header={<Header 
                        variant="h3"
                        actions={
                            <SpaceBetween direction="horizontal" size="m">
                                <Button 
                                    iconName="delete-marker" 
                                    onClick={handleEndSessionAndClear}
                                >
                                    Clear Chats
                                </Button>
                            </SpaceBetween>
                        }
                    >Loan Application Assistant</Header>}
                    fitHeight
                    disableContentPaddings
                    footer={
                        <SpaceBetween size="s">
                            <PromptInput
                                onChange={({ detail }) => setPrompt(detail.value)}
                                onAction={onPromptSend}
                                value={prompt}
                                disabled={isGenAiResponseLoading}
                                actionButtonAriaLabel={isGenAiResponseLoading ? 'Send message button - suppressed' : 'Send message'}
                                actionButtonIconName="send"
                                ariaLabel={isGenAiResponseLoading ? 'Prompt input - suppressed' : 'Prompt input'}
                                placeholder="Ask a question"
                                autoFocus
                                secondaryActions={
                                    <Box padding={{ left: 'xxs', top: 'xs' }}>
                                        <Button
                                            iconName="upload"
                                            variant="icon"
                                            onClick={handleModalOpen}
                                            ariaLabel="Upload doc"
                                        />
                                        <Button
                                            iconName="microphone"
                                            variant="icon"
                                            // onClick={handleMicrophoneClick}
                                            // ariaLabel={isListening ? "Stop recording" : "Start recording"}
                                        />
                                        {selectedDocuments.length > 0 && (
                                            <Box 
                                                padding={{ left: 's' }}
                                                fontSize="body-s"
                                                color="text-body-secondary"
                                            >
                                                <SpaceBetween direction="horizontal" size="xxs">
                                                    {selectedDocuments.map((doc) => (
                                                        <Box 
                                                            key={doc.id}
                                                            padding="xxs"
                                                            fontSize="body-s"
                                                            color="text-status-info"
                                                            display="inline-block"
                                                        >
                                                            {doc.title}
                                                            <Button
                                                                variant="icon"
                                                                iconName="close"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedDocuments(prev => 
                                                                        prev.filter(d => d.id !== doc.id)
                                                                    );
                                                                }}
                                                                aria-label="Remove document"
                                                            />
                                                        </Box>
                                                    ))}
                                                </SpaceBetween>
                                            </Box>
                                        )}
                                    </Box>
                                }
                            />
                            
                            <SplitPanel
                                header="Loan Processing Flow"
                                i18nStrings={{
                                    preferencesTitle: "Split panel preferences",
                                    preferencesPositionLabel: "Split panel position",
                                    preferencesPositionDescription: "Choose the default split panel position.",
                                    preferencesPositionSide: "Side",
                                    preferencesPositionBottom: "Bottom",
                                    preferencesConfirm: "Confirm",
                                    preferencesCancel: "Cancel",
                                    closeButtonAriaLabel: "Close panel",
                                    openButtonAriaLabel: "Open panel",
                                    resizeHandleAriaLabel: "Resize split panel"
                                }}
                                closeBehavior="collapse"
                            >
                                <div className="reactflow-wrapper">
                                    <AgentFlowPanel
                                        ref={agentFlowRef}
                                        sessionId={authedUser?.userID ?? ""}
                                        modelId="loan-processing-model"
                                        createInitialNodes={createInitialLoanNodes}
                                        createInitialEdges={createInitialLoanEdges}
                                        initialNodeDetailsMap={loanNodeDetailsMap}
                                    />
                                </div>
                            </SplitPanel>
                        </SpaceBetween>
                    }
                    
                >
                    <ScrollableContainer 
                      ref={messagesContainerRef}
                    >
                        <Box textAlign="center" padding={{ top: 'xxl', bottom: 'l' }} >
                            <img 
                                src={ChatLogo} 
                                alt="Chat Logo" 
                                style={{ 
                                    padding: '16px'
                                }} 
                            />
                        </Box>
                        <ChatMessages onNewMessage={handleScrollToEnd} agentFlowRef={agentFlowRef} />
                    </ScrollableContainer>
                    
                    <Box padding={{ horizontal: 'l', bottom: 's' }}>
                        <SupportPromptGroup
                            onItemClick={({ detail }) => handleQuickAction(detail.id)}
                            alignment="horizontal"
                            ariaLabel="Quick actions"
                            items={promptItems}
                        />
                    </Box>
                </Container>

                <Modal
                    visible={isModalVisible}
                    onDismiss={handleModalClose}
                    header="Select Documents"
                    size="large"
                    footer={
                        <Box float="right">
                            <SpaceBetween direction="horizontal" size="xs">
                                <Button variant="link" onClick={handleModalClose}>
                                    Cancel
                                </Button>
                                <Button 
                                    variant="primary" 
                                    onClick={handleModalSubmit}
                                    disabled={!selection?.selectedDocs || selection.selectedDocs.length === 0}
                                >
                                    Confirm Selection ({selection.selectedDocs?.length || 0})
                                </Button>
                            </SpaceBetween>
                        </Box>
                    }
                >
                    <Box padding="l">
                        <ImageCards />
                    </Box>
                </Modal>
            </FittedContainer>
        </div>
    );
};
