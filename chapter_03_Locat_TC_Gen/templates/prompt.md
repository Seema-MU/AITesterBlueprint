Our main objective is that I will be sharing with you:
- Jira URL
- Jira token
- Jira email ID
What you need to do is create a simple application in Python, which is a two-page application.Create a simple Python application, a front end application, using strimlet or whatever is needed. In the front first page, we will have options very similar to ChatGPT, where the user can give a prompt saying, "This is a write a test case for Jira ID number 123," and click on the send button. After that, you should be able to fetch the details from Jira. On the second screen, you will have the details of the settings:
- Jira URL
- Jira email ID
- Jira token
- Bionic LocalLLM application, which is running on my local
- the option to use Groq.com for which i provide a token to access.User should be able to add all the details and save in the setting page. 

You need to create a simple application using the Bionic Local LLM, which is running locally. You should take the prompt, connect to the Jira token, fetch the Jira task details, and create test cases. Bionic local LLM(LM Studio) uses gemma3:1b model which I have already installed in my local, and it is running. You need to use bionic local lLM, which is running locally, to run this, or if the user does not want to use this as a fallback, we can use groq.com as well. It is a simple 2-page application where the user will be asked to create a test plan for a Jira ID. You have to connect to the Jira, fetch the task details, and create the test plan according to the template available in the templates folder. 