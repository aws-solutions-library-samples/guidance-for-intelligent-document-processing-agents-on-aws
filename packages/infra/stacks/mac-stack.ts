import { Stack, StackProps, aws_bedrock as _bedrock } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { AgentActionGroup } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';
import { BedrockMacAgent } from "../constructs/mac-construct";
import * as MACConfig from '../config/MACConfig';
import { lambdaArchitecture, lambdaRuntime } from "../config/AppConfig";


export class MacStack extends Stack {
    public agentId: string;
    public agentAliasId: string;
    public broker_agent: bedrock.Agent;
    public broker_agentAlias:_bedrock.CfnAgentAlias;
    public loan_application_assistant_agent: bedrock.Agent;
    public loan_application_assistant_agentAlias:_bedrock.CfnAgentAlias;

    
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const agent_role = new iam.Role(this, `cr_role_agent`, {
            assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                AmazonBedrockAgentInferencProfilePolicy1: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "bedrock:InvokeModel*",
                                "bedrock:CreateInferenceProfile"
                            ],
                            resources: [
                                "arn:aws:bedrock:*::foundation-model/*",
                                "arn:aws:bedrock:*:*:inference-profile/*",
                                "arn:aws:bedrock:*:*:application-inference-profile/*"
                            ],
                        }),
                    ],
                }),
                AmazonBedrockAgentInferencProfilePolicy2: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "bedrock:GetInferenceProfile",
                                "bedrock:ListInferenceProfiles",
                                "bedrock:DeleteInferenceProfile",
                                "bedrock:TagResource",
                                "bedrock:UntagResource",
                                "bedrock:ListTagsForResource"
                            ],
                            resources: [
                                "arn:aws:bedrock:*:*:inference-profile/*",
                                "arn:aws:bedrock:*:*:application-inference-profile/*"
                            ],
                        }),
                    ],
                }),
                AmazonBedrockAgentBedrockFoundationModelPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "bedrock:GetAgentAlias",
                                "bedrock:InvokeAgent",
                                "bedrock:AssociateAgentCollaborator"
                            ],
                            resources: [
                                "arn:aws:bedrock:*:*:agent/*",
                                "arn:aws:bedrock:*:*:agent-alias/*"
                            ],
                        }),
                    ],
                }),
                AmazonBedrockAgentBedrockInvokeGuardrailModelPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "bedrock:InvokeModel"
                            ],
                            resources: ["*"],
                        }),
                    ],
                }),
            }
        });

        /* BROKER AGENT + action group */
        this.broker_agent = new bedrock.Agent(this, "broker_agent_agent", {
            name: `broker_agent`,
            foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V1_0,
            instruction: MACConfig.MACAgentInstruction.BrokerAgent,
            shouldPrepareAgent: true,
            description: MACConfig.MACDescription.BrokerAgent
        })

        const broker_agentAlias = new _bedrock.CfnAgentAlias(this, 'broker_agentAlias', {
            agentAliasName: `broker_agent`,
            agentId: this.broker_agent.agentId,
        });

        /* ASSISTANT AGENT + action group */
        const LoanAssistantActionGroup_lambda = new lambda_python.PythonFunction(this, 'LoanActionGroup_lambda', {
            runtime: lambdaRuntime,
            architecture: lambdaArchitecture,
            handler: 'lambda_handler',
            index: 'loan_applicant_function.py',
            entry: path.join(__dirname, '../lambda/python/bedrock-action-group-lambda'),
            timeout: cdk.Duration.minutes(5),
            memorySize: 1024,
            environment: {
                "ACCOUNT_ID": Stack.of(this).account
            },
        });

        LoanAssistantActionGroup_lambda.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "s3:*",
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:GenerateDataKey*",
                "kms:ReEncrypt*"
            ],
            resources: ["*"],
        }));

        const LoanAssistantActionGroup = new AgentActionGroup({
            name: `loan_action_group`,
            description: 'Handle applicant information collection and document review for loan applicants.',
            executor: bedrock.ActionGroupExecutor.fromlambdaFunction(LoanAssistantActionGroup_lambda),
            enabled: true,
            functionSchema: MACConfig.LoanApplicationActionGroup,
        });

        this.loan_application_assistant_agent = new bedrock.Agent(this, "loan_application_assistant_agent", {
            name: `loan_application_assistant`,
            foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V1_0,
            instruction: MACConfig.MACAgentInstruction.LoanAppAssistant,
            shouldPrepareAgent: true,
            description: MACConfig.MACDescription.LoanAppAssistant,
            codeInterpreterEnabled: true
        })

        const loan_application_assistant_agentAlias = new _bedrock.CfnAgentAlias(this, 'loan_application_assistant_agentAlias', {
            agentAliasName: `loan_application_assistant`,
            agentId: this.loan_application_assistant_agent.agentId,
        });

        this.loan_application_assistant_agent.addActionGroup(LoanAssistantActionGroup)

        /* SUPERVISOR AGENT */
        const loan_assistant_agent = new BedrockMacAgent(this, "loan_assistant_agent", {
            agentName: `loan_assistant`,
            agentCollaboration: 'SUPERVISOR_ROUTER',
            instruction: MACConfig.MACAgentInstruction.LoanAssistant,
            description: MACConfig.MACDescription.LoanAssistant,
            agentResourceRoleArn: agent_role.roleArn,
            foundationModel: MACConfig.FoundationModel.Claude3_5,
            codeInterpreterEnabled: true,
            associateCollaborators: [
                {
                    "sub_agent_association_name": `broker_agent`, "sub_agent_alias_arn": broker_agentAlias.attrAgentAliasArn,
                    "sub_agent_instruction": MACConfig.MACCollaborationInstruction.BrokerAgent
                },
                {
                    "sub_agent_association_name": `loan_application_assistant_agent`, "sub_agent_alias_arn": loan_application_assistant_agentAlias.attrAgentAliasArn,
                    "sub_agent_instruction": MACConfig.MACCollaborationInstruction.LoanAppAssistant
                },
            ],
        });
        loan_assistant_agent.node.addDependency(this.loan_application_assistant_agent);

        this.agentId = loan_assistant_agent.agentId;
        this.agentAliasId = loan_assistant_agent.agentAliasId;

        new cdk.CfnOutput(this, 'AgentId', {
            value: this.agentId,
            description: 'The ID of the Bedrock agent',
            exportName: `${id}-AgentId`
        });

        new cdk.CfnOutput(this, 'AgentAliasId', {
            value: this.agentAliasId,
            description: 'The ID of the Bedrock agent alias',
            exportName: `${id}-AgentAliasId`
        });
    }
}