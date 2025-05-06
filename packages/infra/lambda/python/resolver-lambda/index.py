import os
import json
import uuid
import boto3
from botocore.config import Config
from datetime import datetime
from botocore.exceptions import ClientError

# power tools import
from aws_lambda_powertools.utilities.data_classes.appsync_resolver_event import (
    AppSyncResolverEvent
)
from aws_lambda_powertools.logging import Logger, correlation_paths

# graphQL imports
from gql_utils import gql_executor, success_response, failure_response
from gql import get_chats_by_user_id, update_chat_by_id

# Initializers
logger = Logger()

# environment variables
region_name = os.environ['AWS_REGION']
graphql_endpoint = os.environ['graphql_endpoint']
# create the bedrock agent runtime client
config = Config(
    read_timeout=1000,
    retries=dict(
        max_attempts=3,
        mode='adaptive'
    ),
    # Add rate limiting
    max_pool_connections=10,
    # Add timeouts
    connect_timeout=5
)
bedrock_agent_runtime = boto3.client(
    service_name="bedrock-agent-runtime",
    region_name=region_name,
    config=config
)
current_datetime = datetime.now()
agentId = os.environ.get('AGENT_ID', '')
agentAliasId = os.environ.get('AGENT_ALIAS_ID', '')


def sort_by_js_date(data, date_key):
    def date_converter(obj):
        # Convert JavaScript date string to Python datetime object
        return datetime.strptime(obj[date_key], '%Y-%m-%dT%H:%M:%S.%fZ')

    return sorted(data, key=date_converter)

def escape_special_chars(text):
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
    )

def create_safe_message(input_data):
    safe_data = escape_special_chars(json.dumps(input_data, indent=4))
    return f"<input>\n{safe_data}\n</input>"

def process_bot_response(bot_response):
    # Preserve special characters and formatting
    print("process_bot_response", bot_response)
    formatted_response = bot_response.replace('\n', '\n')  # Convert newlines to HTML breaks
    # Keep emojis as is - they're Unicode and should render correctly
    
    # Handle code blocks (if any)
    if '```' in formatted_response:
        formatted_response = formatted_response.replace('```', '<pre><code>', 1)
        formatted_response = formatted_response.replace('```', '</code></pre>', 1)
    
    return formatted_response

def format_document_info(documents):
    """Format document information while preserving all formatting"""
    doc_info = "\nAttached Documents:\n"  # Keep original newlines
    for doc in documents:
        doc_info += f"- 📄 {doc['title']}\n"  # Keep newline for each document
    return doc_info

def process_trace_event(event):
    try:
        if 'trace' in event:
            trace_data = event['trace']
            
            # Base trace info structure
            trace_info = {
                "type": "trace",
                "timestamp": trace_data['eventTime'].isoformat() if 'eventTime' in trace_data else datetime.now().isoformat(),
                "content": {
                    "collaboratorName": None,
                    "action": None,
                    "sessionId": trace_data.get('sessionId'),
                    "status": "processing",
                    "text": None
                }
            }

            # Check root level collaboratorName first
            if 'collaboratorName' in trace_data:
                trace_info['content']['collaboratorName'] = trace_data['collaboratorName']

            # Process inner trace data
            if 'trace' in trace_data:
                inner_trace = trace_data['trace']

                # Handle routing classifier trace
                if 'routingClassifierTrace' in inner_trace:
                    routing_trace = inner_trace['routingClassifierTrace']
                    
                    # Get the first key as action
                    if routing_trace:
                        trace_info['content']['action'] = next(iter(routing_trace.keys()))
                    # Add modelInvocationInput handling here
                    if 'modelInvocationInput' in routing_trace:
                        model_input = routing_trace['modelInvocationInput']
                        if 'text' in model_input:
                            try:
                                # First parse the text as it's a JSON string
                                text_data = json.loads(model_input['text'])
                                if 'messages' in text_data and len(text_data['messages']) > 0:
                                    message = text_data['messages'][0]
                                    if 'content' in message:
                                        trace_info['content']['text'] = message['content']
                            except Exception as e:
                                logger.error(f"Error processing modelInvocationInput text: {str(e)}")
                                logger.error(f"Model input text structure: {model_input['text']}")

                    
                    elif 'observation' in routing_trace:
                        observation = routing_trace['observation']
                        if 'agentCollaboratorInvocationOutput' in observation:
                            collab_output = observation['agentCollaboratorInvocationOutput']
                            trace_info['content']['collaboratorName'] = collab_output.get('agentCollaboratorName')
                            
                            if 'output' in collab_output:
                                trace_info['content']['text'] = collab_output['output'].get('text')
                        
                        # Handle finalResponse in routingClassifierTrace
                        elif 'finalResponse' in observation:
                            final_response = observation['finalResponse']
                            if 'text' in final_response:
                                trace_info['content']['text'] = final_response['text']
                                # Set complete status if type is FINISH
                                if observation.get('type') == 'FINISH':
                                    trace_info['content']['status'] = 'complete'

                    elif 'invocationInput' in routing_trace:
                        invocation = routing_trace['invocationInput']
                        if 'agentCollaboratorInvocationInput' in invocation:
                            collab_input = invocation['agentCollaboratorInvocationInput']
                            trace_info['content']['collaboratorName'] = collab_input.get('agentCollaboratorName')
                            
                            if 'input' in collab_input:
                                trace_info['content']['text'] = collab_input['input'].get('text')

                # Handle orchestration trace
                elif 'orchestrationTrace' in inner_trace:
                    orchestration = inner_trace['orchestrationTrace']
                    
                    # Get the first key as action for orchestration trace
                    if orchestration:
                        trace_info['content']['action'] = next(iter(orchestration.keys()))

                    if 'modelInvocationOutput' in orchestration:
                        model_output = orchestration['modelInvocationOutput']
                        if 'rawResponse' in model_output:
                            try:
                                raw_response = json.loads(model_output['rawResponse']['content'])
                                if 'content' in raw_response:
                                    # Extract text from the first content item that has text
                                    for content_item in raw_response['content']:
                                        if content_item.get('text'):
                                            trace_info['content']['text'] = content_item['text']
                                            break
                            except (json.JSONDecodeError, KeyError) as e:
                                logger.error(f"Error parsing model output: {str(e)}")

                    elif 'rationale' in orchestration:
                        rationale = orchestration['rationale']
                        if 'text' in rationale:
                            trace_info['content']['text'] = rationale['text']
                    
                    elif 'observation' in orchestration:
                        observation = orchestration['observation']
                        if 'finalResponse' in observation:
                            final_response = observation['finalResponse']
                            if 'text' in final_response:
                                trace_info['content']['text'] = final_response['text']
                                # Only set complete status if type is FINISH
                                if observation.get('type') == 'FINISH':
                                    trace_info['content']['status'] = 'complete'


            print("=====trace_info=====")
            print(trace_info)
            return trace_info

    except Exception as e:
        logger.error(f"Error in process_trace_event: {str(e)}")
        # Return a basic trace info structure in case of error
        return {
            "type": "trace",
            "timestamp": datetime.now().isoformat(),
            "content": {
                "collaboratorName": None,
                "action": None,
                "status": "error",
                "error": str(e),
                "text": None
            }
        }


@logger.inject_lambda_context(correlation_id_path=correlation_paths.APPSYNC_RESOLVER, log_event=True)
def lambda_handler(event, context):
    app_sync_event: AppSyncResolverEvent = AppSyncResolverEvent(event)
    print(app_sync_event)

    arguments = app_sync_event.arguments.get("args")
    host = app_sync_event.request_headers.get("host")
    auth_token = app_sync_event.request_headers.get("authorization")
    api_key = app_sync_event.request_headers.get("x-api-key")
    # load the args and augment with other key information from request
    args = json.loads(arguments)
    args["host"] = host
    args["auth_token"] = auth_token
    args["api_key"] = api_key
    logger.info(args)

    try:
        if args["opr"] == "chat":
            end_session = False
            message_content = args["message"]
            if "end_session" in message_content:
                end_session = True

            if "documents" in args and args["documents"]:
                doc_info = "\nAttached Documents:\n" + "\n".join([f"- {doc['title']}" for doc in args["documents"]])
                message_content += doc_info

            # print("Message message_content:", message_content)
            try:
                enable_trace = True

                response = bedrock_agent_runtime.invoke_agent(
                    agentId=agentId,
                    agentAliasId=agentAliasId,
                    sessionId=args["userID"],
                    enableTrace=enable_trace,
                    endSession=end_session,
                    inputText=message_content,
                    sessionState={
                        'promptSessionAttributes': {
                            "today's date": str(current_datetime.date())
                        },
                    }
                )

                bot_response = ''
                metrics = {}
                event_stream = response['completion']

                for event in event_stream:
                    if 'chunk' in event:
                        data = event['chunk']['bytes']
                        bot_response = data.decode('utf8')
                        print(f"Processing chunk: {bot_response}")

                        # Decode and preserve formatting
                        decoded_response = data.decode('utf8')
                        
                    elif 'trace' in event:
                        if enable_trace:
                            try:
                                # Process trace event
                                trace_info = process_trace_event(event)

                                # Use default=str to handle datetime serialization
                                trace_json = json.dumps(trace_info, default=str)
                                
                                # Send to GQL
                                gql_executor(graphql_endpoint,
                                            host=args["host"],
                                            auth_token=args["auth_token"],
                                            api_key=None,
                                            payload={
                                                "query": update_chat_by_id,
                                                "variables": {
                                                    "input": {
                                                        "id": args["id"],
                                                        "userID": args["userID"],
                                                        "human": args["message"],
                                                        "bot": bot_response,
                                                        "payload": json.dumps({
                                                            "trace": trace_info,
                                                            "metrics": metrics,
                                                            "documents": args.get("documents", [])
                                                        })
                                                    }
                                                }
                                            })
                            except Exception as e:
                                logger.error(f"Error processing trace event: {str(e)}")
                                logger.error(f"Trace event that caused error: {json.dumps(event, default=str)}")
                    
                    else:
                        raise Exception("unexpected event.", event)
                print(f"Final accumulated response:\n{bot_response}")  # Debug print
                formatted_bot_response = process_bot_response(decoded_response)
                print(f"Formatted bot response:\n{formatted_bot_response}")  # Debug print

            except ClientError as e:
                print(f"Error invoking agent: {e}")
                raise
            except Exception as e:
                raise Exception("unexpected event.", e)

            # send an update to gql this will trigger subscriptions on UI
            gql_executor(graphql_endpoint,
                            host=args["host"],
                            auth_token=args["auth_token"],
                            api_key=None,
                            payload={
                                "query":  update_chat_by_id,
                                "variables": {
                                    "input": {
                                        "id": args["id"],
                                        "userID": args["userID"],
                                        "human": args["message"],
                                        "bot": bot_response,
                                        "payload": json.dumps({
                                            "metrics": metrics,
                                            "documents": args.get("documents", [])
                                        })
                                    },

                                }
                            })
        
        elif args["opr"] == "generate_approval_letter":
            try:
                # Format the form data as a JSON string matching the expected input format
                input_data = {
                    "applicationName": args.get("applicationName", ""),
                    "date": args.get("date", ""),
                    "loanAmount": args.get("loanAmount", ""),
                    "loanTerms": args.get("loanTerms", ""),
                    "mailAddress": args.get("mailAddress", ""),
                    "propertyAddress": args.get("propertyAddress", ""),
                    "propertyAddressSameAsMail": args.get("propertyAddressSameAsMail", False),
                    "purchasePrice": args.get("purchasePrice", ""),
                    "satisfactoryPurchaseAgreement": args.get("satisfactoryPurchaseAgreement", True),
                    "sufficientAppraisal": args.get("sufficientAppraisal", True),
                    "marketableTitle": args.get("marketableTitle", True)
                }

                # Format the input as expected by the agent
                message_content = create_safe_message(input_data)
                message_content += "Genereate pre-approval letter: "
                
                enable_trace = False
                session_id = f"approval-letter-{datetime.now().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:8]}"
                
                response = bedrock_agent_runtime.invoke_agent(
                    agentId=agentId,
                    agentAliasId=agentAliasId,
                    sessionId=session_id,
                    enableTrace=enable_trace,
                    inputText=message_content
                )

                if enable_trace:
                    print("Agent response:", response)

                generated_html = ''
                event_stream = response['completion']

                for event in event_stream:
                    if 'chunk' in event:
                        data = event['chunk']['bytes']
                        chunk_text = data.decode('utf8')
                        generated_html += chunk_text  # Accumulate chunks
                        print(f"Processing HTML chunk: {chunk_text}")
                        
                    elif 'trace' in event:
                        if enable_trace:
                            logger.info(json.dumps(event['trace'], indent=2))
                    else:
                        raise Exception("unexpected event.", event)

                print(f"Final HTML response:\n{generated_html}")
                
                return success_response(generated_html)

            except ClientError as e:
                logger.error(f"Error calling Bedrock Agent: {e}")
                return failure_response(f"Error generating approval letter: {str(e)}")
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                return failure_response(f"Unexpected error generating letter: {str(e)}")

    # generate a catch block
    except Exception as e:
        logger.error(e)
        return failure_response("Appsync resolver error")