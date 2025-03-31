import os
from openai import AzureOpenAI

def get_openai_client():
    """
    Create and return an Azure OpenAI client
    
    Returns:
        AzureOpenAI: The client instance
    """
    client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("OPENAI_API_VERSION"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
    )
    return client

def get_chat_completion(messages, model=None):
    """
    Get a chat completion from the Azure OpenAI API
    
    Args:
        messages (list): List of message objects with role and content
        model (str, optional): Model deployment name. Defaults to value from env.
    
    Returns:
        str: The completion text
    """
    client = get_openai_client()
    deployment_name = model or os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
    
    response = client.chat.completions.create(
        model=deployment_name,
        messages=messages,
        temperature=0.7,
        max_tokens=800
    )
    
    return response.choices[0].message.content

def get_completion(prompt, model=None):
    """
    Get a completion from the Azure OpenAI API
    
    Args:
        prompt (str): The prompt text
        model (str, optional): Model deployment name. Defaults to value from env.
    
    Returns:
        str: The completion text
    """
    client = get_openai_client()
    deployment_name = model or os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
    
    response = client.completions.create(
        model=deployment_name,
        prompt=prompt,
        max_tokens=500
    )
    
    return response.choices[0].text
