import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import "fetch-to-node";

// Helper function to make API calls with dynamic API address and token
const makeApiCall = async (
  endpoint: string,
  apiAddress: string,
  apiToken: string,
  method: string = "GET",
  body?: any,
  customHeaders?: Record<string, string>
): Promise<any> => {
  const url = `https://${apiAddress}.org.machina.gg${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-token": apiToken,
    ...customHeaders
  };
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
};

// Common API parameters schema
const apiConfigSchema = {
  apiAddress: z.string().describe("Your API organization address (e.g., 'entain-organization-sportingbet-blog-trainin')"),
  apiToken: z.string().describe("Your x-api-token for authentication")
};

export const setupMCPServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "machina-sports-server",
      version: "2.0.0",
    },
    { capabilities: { logging: {} } }
  );

  // AGENT TOOLS

  // Create Agent
  server.tool(
    "create-agent",
    "Create a new agent and define its configurations",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique identifier for the agent"),
      title: z.string().describe("Display title of the agent"),
      description: z.string().describe("Detailed description of the agent's purpose"),
      context: z.object({}).optional().describe("Configuration settings for the agent"),
      workflows: z.array(z.object({
        name: z.string().describe("Name of the workflow"),
        description: z.string().describe("Description of the workflow"),
        condition: z.string().optional().describe("Condition for workflow execution"),
        inputs: z.object({}).optional().describe("Input mappings for the workflow"),
        outputs: z.object({}).optional().describe("Output mappings for the workflow")
      })).optional().describe("Array of workflow definitions"),
      status: z.enum(["active", "inactive"]).default("active").describe("Current status of the agent")
    },
    async ({ apiAddress, apiToken, name, title, description, context, workflows, status }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Creating agent: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/agent", apiAddress, apiToken, "POST", {
          name,
          title,
          description,
          context,
          workflows,
          status
        });

        return {
          content: [
            {
              type: "text",
              text: `Agent created successfully!\n\nAgent ID: ${result.data.id}\nStatus: ${result.status}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Execute Agent by ID
  server.tool(
    "execute-agent-by-id",
    "Execute an agent using its unique identifier",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the agent to execute"),
      agentConfig: z.object({
        delay: z.boolean().default(true).describe("Whether to execute the agent asynchronously")
      }).optional().describe("Configuration options for the execution"),
      input: z.object({}).optional().describe("Input parameters for the agent execution"),
      context: z.object({}).optional().describe("Additional context data for the agent execution")
    },
    async ({ apiAddress, apiToken, id, agentConfig, input, context }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Executing agent with ID: ${id} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/agent/executor/id/${id}`, apiAddress, apiToken, "POST", {
          "agent-config": agentConfig,
          input,
          context
        });

        return {
          content: [
            {
              type: "text",
              text: `Agent execution ${result.status}!\n\nExecution ID: ${result.execution_id}\nStatus: ${result.status}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Execute Agent by Name
  server.tool(
    "execute-agent-by-name",
    "Execute an agent using its unique name",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique name of the agent to execute"),
      agentConfig: z.object({
        delay: z.boolean().default(true).describe("Whether to execute the agent asynchronously")
      }).optional().describe("Configuration options for the execution"),
      input: z.object({}).optional().describe("Input parameters for the agent execution"),
      context: z.object({}).optional().describe("Additional context data for the agent execution")
    },
    async ({ apiAddress, apiToken, name, agentConfig, input, context }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Executing agent with name: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/agent/executor/${name}`, apiAddress, apiToken, "POST", {
          "agent-config": agentConfig,
          input,
          context
        });

        return {
          content: [
            {
              type: "text",
              text: `Agent execution ${result.status}!\n\nExecution ID: ${result.execution_id}\nStatus: ${result.status}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Agent by ID
  server.tool(
    "get-agent-by-id",
    "Retrieve an agent by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the agent")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching agent with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/agent/id/${id}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Agent Details:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Agent by Name
  server.tool(
    "get-agent-by-name",
    "Retrieve an agent by its unique name",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique name of the agent")
    },
    async ({ apiAddress, apiToken, name }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching agent with name: ${name} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/agent/${name}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Agent Details:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Search Agents  
  server.tool(
    "search-agents",
    "Search for agents using sort, filter and pagination",
    {
      ...apiConfigSchema,
      filters: z.object({}).default({}).describe("Query filters object"),
      sorters: z.array(z.union([z.string(), z.number()])).default(["_id", -1]).describe("Array containing field name and sort direction"),
      page: z.number().default(1).describe("Page number (starts from 1)"),
      pageSize: z.number().default(10).describe("Number of items per page")
    },
    async ({ apiAddress, apiToken, filters, sorters, page, pageSize }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Searching agents on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/agent/search", apiAddress, apiToken, "POST", {
          filters,
          sorters,
          page,
          page_size: pageSize
        });

        return {
          content: [
            {
              type: "text",
              text: `Found ${result.total_documents} agents:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching agents: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Update Agent
  server.tool(
    "update-agent",
    "Update an existing agent by its ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the agent to update"),
      title: z.string().optional().describe("Updated display title of the agent"),
      description: z.string().optional().describe("Updated description of the agent's purpose"),
      status: z.enum(["active", "inactive"]).optional().describe("Updated status of the agent"),
      context: z.object({}).optional().describe("Updated configuration settings for the agent"),
      workflows: z.array(z.object({})).optional().describe("Updated list of workflows associated with the agent")
    },
    async ({ apiAddress, apiToken, id, title, description, status, context, workflows }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Updating agent with ID: ${id} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const updateData: any = {};
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (status) updateData.status = status;
        if (context) updateData.context = context;
        if (workflows) updateData.workflows = workflows;

        const result = await makeApiCall(`/agent/${id}`, apiAddress, apiToken, "PUT", updateData);

        return {
          content: [
            {
              type: "text",
              text: `Agent updated successfully!\n\nMessage: ${result.message}\nStatus: ${result.status}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Agent
  server.tool(
    "delete-agent",
    "Delete an agent by its ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the agent to delete")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Deleting agent with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/agent/${id}`, apiAddress, apiToken, "DELETE");

        return {
          content: [
            {
              type: "text",
              text: `Agent deleted successfully!\n\nDeleted Agent ID: ${result.data.id}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting agent: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // DOCUMENT TOOLS

  // Create Document
  server.tool(
    "create-document",
    "Create a new document and configure metadata and properties",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique identifier for the document"),
      value: z.any().optional().describe("The main data of the document, can be any type (string, object, array, etc.)"),
      metadata: z.object({}).optional().describe("Additional metadata for the document"),
      status: z.enum(["active", "draft", "archived"]).default("active").describe("Current status of the document"),
      embedVector: z.boolean().optional().describe("Whether to create a vector embedding for the document")
    },
    async ({ apiAddress, apiToken, name, value, metadata, status, embedVector }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Creating document: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/document", apiAddress, apiToken, "POST", {
          name,
          value,
          metadata,
          status,
          "embed-vector": embedVector
        });

        return {
          content: [
            {
              type: "text",
              text: `Document created successfully!\n\nDocument ID: ${result.data._id}\nName: ${result.data.name}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating document: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Document by ID
  server.tool(
    "get-document-by-id",
    "Retrieve a document by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the document")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching document with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/document/${id}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Document Details:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching document: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Update Document
  server.tool(
    "update-document",
    "Modify an existing document's data and properties by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the document to update"),
      value: z.any().optional().describe("The main data of the document, can be any type (string, object, array, etc.)"),
      metadata: z.object({}).optional().describe("Additional metadata for the document"),
      status: z.enum(["active", "draft", "archived"]).optional().describe("Updated status of the document")
    },
    async ({ apiAddress, apiToken, id, value, metadata, status }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Updating document with ID: ${id} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const updateData: any = {};
        if (value !== undefined) updateData.value = value;
        if (metadata) updateData.metadata = metadata;
        if (status) updateData.status = status;

        const result = await makeApiCall(`/document/${id}`, apiAddress, apiToken, "PUT", updateData);

        return {
          content: [
            {
              type: "text",
              text: `Document updated successfully!\n\nDocument ID: ${result.data._id}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating document: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Document
  server.tool(
    "delete-document",
    "Remove an existing document by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the document to delete")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Deleting document with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/document/${id}`, apiAddress, apiToken, "DELETE");

        return {
          content: [
            {
              type: "text",
              text: `Document deleted successfully!\n\nDeleted Document ID: ${result.data.id}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting document: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Search Documents
  server.tool(
    "search-documents",
    "Search for documents using sort, filter and pagination",
    {
      ...apiConfigSchema,
      filters: z.object({}).default({}).describe("Filter criteria for the search"),
      sorters: z.array(z.union([z.string(), z.number()])).default(["_id", -1]).describe("Sorting instructions (field name and direction)"),
      page: z.number().default(1).describe("Page number for pagination"),
      pageSize: z.number().default(10).describe("Number of results per page")
    },
    async ({ apiAddress, apiToken, filters, sorters, page, pageSize }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Searching documents on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/document/search", apiAddress, apiToken, "POST", {
          filters,
          sorters,
          page,
          page_size: pageSize
        });

        return {
          content: [
            {
              type: "text",
              text: `Found ${result.total_documents} documents:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching documents: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // WORKFLOW TOOLS

  // Create Workflow
  server.tool(
    "create-workflow",
    "Create a new workflow and configure its parameters",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique identifier for the workflow"),
      title: z.string().describe("Display title of the workflow"),
      description: z.string().describe("Detailed description of the workflow's purpose"),
      contextVariables: z.object({}).optional().describe("Configuration settings and API keys for the workflow"),
      inputs: z.object({}).optional().describe("Input parameters for the workflow with default values or expressions"),
      outputs: z.object({
        "workflow-status": z.string().describe("Expression that evaluates to 'executed', 'skipped', or 'failed'")
      }).describe("Output mappings for the workflow using expressions"),
      tasks: z.array(z.object({
        type: z.enum(["connector", "document", "ai", "transform", "condition"]).describe("Type of task"),
        name: z.string().describe("Name of the task"),
        description: z.string().describe("Description of the task's purpose"),
        condition: z.string().optional().describe("Condition for task execution"),
        inputs: z.object({}).optional().describe("Input mappings for the task"),
        outputs: z.object({}).optional().describe("Output mappings for the task")
      })).optional().describe("Array of task definitions that make up the workflow"),
      status: z.enum(["active", "inactive"]).default("active").describe("Current status of the workflow")
    },
    async ({ apiAddress, apiToken, name, title, description, contextVariables, inputs, outputs, tasks, status }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Creating workflow: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/workflow", apiAddress, apiToken, "POST", {
          name,
          title,
          description,
          "context-variables": contextVariables,
          inputs,
          outputs,
          tasks,
          status
        });

        return {
          content: [
            {
              type: "text",
              text: `Workflow created successfully!\n\nWorkflow ID: ${result.data._id}\nStatus: ${result.status}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Workflow by ID
  server.tool(
    "get-workflow-by-id",
    "Retrieve a workflow by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the workflow")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching workflow with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/${id}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Workflow Details:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Workflow by Name
  server.tool(
    "get-workflow-by-name",
    "Retrieve a workflow by its unique name",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique name of the workflow")
    },
    async ({ apiAddress, apiToken, name }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching workflow with name: ${name} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/${name}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Workflow Details:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Update Workflow
  server.tool(
    "update-workflow",
    "Update an existing workflow by its ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the workflow to update"),
      title: z.string().optional().describe("Updated display title of the workflow"),
      description: z.string().optional().describe("Updated description of the workflow's purpose"),
      status: z.enum(["active", "inactive"]).optional().describe("Updated status of the workflow"),
      context: z.object({}).optional().describe("Updated configuration settings for the workflow"),
      inputs: z.object({}).optional().describe("Updated input parameters for the workflow"),
      outputs: z.object({}).optional().describe("Updated output mappings for the workflow")
    },
    async ({ apiAddress, apiToken, id, title, description, status, context, inputs, outputs }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Updating workflow with ID: ${id} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const updateData: any = {};
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (status) updateData.status = status;
        if (context) updateData.context = context;
        if (inputs) updateData.inputs = inputs;
        if (outputs) updateData.outputs = outputs;

        const result = await makeApiCall(`/workflow/${id}`, apiAddress, apiToken, "PUT", updateData);

        return {
          content: [
            {
              type: "text",
              text: `Workflow updated successfully!\n\nWorkflow ID: ${result.data._id}\nStatus: ${result.status}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Workflow
  server.tool(
    "delete-workflow",
    "Remove an existing workflow by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the workflow to delete")
    },
    async ({ apiAddress, apiToken, id }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Deleting workflow with ID: ${id} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/${id}`, apiAddress, apiToken, "DELETE");

        return {
          content: [
            {
              type: "text",
              text: `Workflow deleted successfully!\n\nMessage: ${result.message}\nStatus: ${result.status}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Search Workflows
  server.tool(
    "search-workflows",
    "Search for workflows using sort, filter and pagination",
    {
      ...apiConfigSchema,
      filters: z.object({}).default({}).describe("Query filters object"),
      sorters: z.array(z.union([z.string(), z.number()])).default(["name", 1]).describe("Array containing field name and sort direction"),
      page: z.number().default(1).describe("Page number (starts from 1)"),
      pageSize: z.number().default(10).describe("Number of items per page")
    },
    async ({ apiAddress, apiToken, filters, sorters, page, pageSize }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Searching workflows on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall("/workflow/search", apiAddress, apiToken, "POST", {
          filters,
          sorters,
          page,
          page_size: pageSize
        });

        return {
          content: [
            {
              type: "text",
              text: `Found ${result.total_documents} workflows:\n\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching workflows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Execute Workflow by ID
  server.tool(
    "execute-workflow-by-id",
    "Trigger a workflow run by its unique ID",
    {
      ...apiConfigSchema,
      id: z.string().describe("Unique ID of the workflow to execute"),
      skipDelay: z.boolean().default(false).describe("Whether to execute the workflow immediately"),
      input: z.object({}).optional().describe("Input parameters for the workflow execution"),
      context: z.object({}).optional().describe("Additional context data for the workflow execution")
    },
    async ({ apiAddress, apiToken, id, skipDelay, input, context }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Executing workflow with ID: ${id} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/executor/id/${id}`, apiAddress, apiToken, "POST", {
          skip_delay: skipDelay,
          input,
          context
        });

        return {
          content: [
            {
              type: "text",
              text: `Workflow execution initiated!\n\nStatus: ${result.status}\nData: ${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Execute Workflow by Name
  server.tool(
    "execute-workflow-by-name",
    "Trigger a workflow run by its unique name",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique name of the workflow to execute"),
      skipDelay: z.boolean().default(false).describe("Whether to execute the workflow immediately"),
      input: z.object({}).optional().describe("Input parameters for the workflow execution"),
      context: z.object({}).optional().describe("Additional context data for the workflow execution")
    },
    async ({ apiAddress, apiToken, name, skipDelay, input, context }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Executing workflow with name: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/executor/${name}`, apiAddress, apiToken, "POST", {
          skip_delay: skipDelay,
          input,
          context
        });

        return {
          content: [
            {
              type: "text",
              text: `Workflow execution initiated!\n\nStatus: ${result.status}\nData: ${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Execute Workflow by Name (Immediate)
  server.tool(
    "execute-workflow-immediate",
    "Execute a workflow immediately by its name",
    {
      ...apiConfigSchema,
      name: z.string().describe("Unique name of the workflow to execute"),
      context: z.object({}).optional().describe("Context data for the workflow execution")
    },
    async ({ apiAddress, apiToken, name, context }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Executing workflow immediately: ${name} on ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/execute/${name}`, apiAddress, apiToken, "POST", context || {});

        return {
          content: [
            {
              type: "text",
              text: `Workflow executed successfully!\n\nStatus: ${result.status}\nData: ${JSON.stringify(result.data, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Scheduled Workflow by Run ID
  server.tool(
    "get-scheduled-workflow",
    "Retrieve data from a scheduled workflow execution",
    {
      ...apiConfigSchema,
      workflowRunId: z.string().describe("Unique run ID of the scheduled workflow execution")
    },
    async ({ apiAddress, apiToken, workflowRunId }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching scheduled workflow with run ID: ${workflowRunId} from ${apiAddress}.org.machina.gg...`,
          },
        });

        const result = await makeApiCall(`/workflow/schedule/${workflowRunId}`, apiAddress, apiToken);

        return {
          content: [
            {
              type: "text",
              text: `Scheduled Workflow Details:\n\n${JSON.stringify(result.data, null, 2)}\n\nTotals: ${JSON.stringify(result.totals, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching scheduled workflow: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool for fetching Machina documentation
  server.tool(
    "get-machina-docs",
    "Fetches documentation from docs.machina.gg with intelligent content extraction and formatting",
    {
      page: z
        .string()
        .describe("The specific page or section to fetch (default is 'introduction')")
        .default("introduction"),
      format: z
        .enum(["text", "html", "markdown"])
        .describe("Format of the returned documentation")
        .default("text"),
    },
    async ({ page, format }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching documentation for ${page} from docs.machina.gg...`,
          },
        });

        // Construct the URL based on the requested page
        const url = `https://docs.machina.gg/${page}`;
        
        // Fetch the documentation
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch documentation: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Extract the main content
        const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const mainContent = mainContentMatch ? mainContentMatch[1] : html;
        
        let formattedContent;
        
        // Format content based on requested format
        if (format === "html") {
          formattedContent = mainContent;
        } else if (format === "markdown") {
          // Enhanced HTML to Markdown conversion
          formattedContent = mainContent
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '* $1\n')
            .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n')
            .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<hr\s*\/?>/gi, '\n---\n\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/^\s+|\s+$/g, '');
        } else {
          // Clean up HTML tags (text format)
          formattedContent = mainContent
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        return {
          content: [
            {
              type: "text",
              text: `Documentation from ${url}:\n\n${formattedContent}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error fetching documentation:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching documentation: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool for fetching Machina API reference with enhanced parsing
  server.tool(
    "get-machina-api-reference",
    "Fetches API reference documentation from docs.machina.gg/api-reference with smart endpoint mapping and schema extraction",
    {
      endpoint: z
        .string()
        .describe("The specific API endpoint to fetch (e.g., 'agents', 'workflows', 'documents', 'create-agent', 'search-agents', etc.)")
        .optional(),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .describe("HTTP method to filter by")
        .optional(),
      include_schemas: z
        .boolean()
        .describe("Include request/response schemas in the output")
        .default(true),
      format: z
        .enum(["text", "html", "markdown"])
        .describe("Format of the returned API reference")
        .default("text"),
    },
    async ({ endpoint, method, include_schemas, format }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching API reference${endpoint ? ` for ${endpoint}` : ''} from docs.machina.gg...`,
          },
        });

        // Construct the URL - start with the main API reference page
        let url = "https://docs.machina.gg/api-reference/introduction";
        
        // If specific endpoint is requested, try to construct the specific URL
        if (endpoint) {
          // Enhanced endpoint mapping
          const endpointMap: Record<string, string> = {
            // Main categories
            'agents': 'api-reference/agents',
            'workflows': 'api-reference/workflows', 
            'documents': 'api-reference/documents',
            
            // Agent endpoints
            'create-agent': 'api-reference/agents/create-agent',
            'search-agents': 'api-reference/agents/search-agents',
            'execute-agent': 'api-reference/agents/execute-agent-by-id',
            'execute-agent-by-id': 'api-reference/agents/execute-agent-by-id',
            'execute-agent-by-name': 'api-reference/agents/execute-agent-by-name',
            'get-agent': 'api-reference/agents/get-agent-by-id',
            'get-agent-by-id': 'api-reference/agents/get-agent-by-id',
            'get-agent-by-name': 'api-reference/agents/get-agent-by-name',
            'update-agent': 'api-reference/agents/update-agent',
            'delete-agent': 'api-reference/agents/delete-agent',
            
            // Document endpoints
            'create-document': 'api-reference/documents/create-document',
            'search-documents': 'api-reference/documents/search-documents',
            'get-document': 'api-reference/documents/get-document-by-id',
            'get-document-by-id': 'api-reference/documents/get-document-by-id',
            'update-document': 'api-reference/documents/update-document',
            'delete-document': 'api-reference/documents/delete-document',
            
            // Workflow endpoints
            'create-workflow': 'api-reference/workflows/create-workflow',
            'search-workflows': 'api-reference/workflows/search-workflows',
            'execute-workflow': 'api-reference/workflows/execute-workflow-by-id',
            'execute-workflow-by-id': 'api-reference/workflows/execute-workflow-by-id',
            'execute-workflow-by-name': 'api-reference/workflows/execute-workflow-by-name',
            'get-workflow': 'api-reference/workflows/get-workflow-by-id',
            'get-workflow-by-id': 'api-reference/workflows/get-workflow-by-id',
            'get-workflow-by-name': 'api-reference/workflows/get-workflow-by-name',
            'get-scheduled-workflow': 'api-reference/workflows/get-scheduled-workflow-by-run-id',
            'update-workflow': 'api-reference/workflows/update-workflow',
            'delete-workflow': 'api-reference/workflows/delete-workflow'
          };
           
          const mappedEndpoint = endpointMap[endpoint.toLowerCase()];
          if (mappedEndpoint) {
            url = `https://docs.machina.gg/${mappedEndpoint}`;
          }
        }
        
        // Fetch the API reference
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch API reference: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Extract the main content
        const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        let mainContent = mainContentMatch ? mainContentMatch[1] : html;
        
        // Extract API-specific content sections if requested
        if (include_schemas) {
          // Try to extract JSON schemas and code examples
          const codeBlocks = html.match(/<code[^>]*class="[^"]*json[^"]*"[^>]*>([\s\S]*?)<\/code>/gi);
          const preBlocks = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
          
          if (codeBlocks || preBlocks) {
            mainContent += '\n\n<!-- API Schemas and Examples -->\n';
            if (codeBlocks) mainContent += codeBlocks.join('\n');
            if (preBlocks) mainContent += preBlocks.join('\n');
          }
        }
        
        let formattedContent;
        
        // Format content based on requested format
        if (format === "html") {
          formattedContent = mainContent;
        } else if (format === "markdown") {
          // Enhanced HTML to Markdown conversion specifically for API docs
          formattedContent = mainContent
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
            .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '* $1\n')
            .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n')
            .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n')
            .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
            .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
              // Enhanced table conversion for API documentation
              let tableContent = match;
              
              // Convert table headers
              tableContent = tableContent.replace(/<thead[^>]*>([\s\S]*?)<\/thead>/gi, (headerMatch) => {
                return headerMatch
                  .replace(/<tr[^>]*>/gi, '\n')
                  .replace(/<\/tr>/gi, ' |\n|')
                  .replace(/<th[^>]*>(.*?)<\/th>/gi, '| $1 ')
                  .replace(/<[^>]*>/g, '') + '---|'.repeat(5) + '\n';
              });
              
              // Convert table body
              tableContent = tableContent.replace(/<tbody[^>]*>([\s\S]*?)<\/tbody>/gi, (bodyMatch) => {
                return bodyMatch
                  .replace(/<tr[^>]*>/gi, '\n')
                  .replace(/<\/tr>/gi, ' |')
                  .replace(/<td[^>]*>(.*?)<\/td>/gi, '| $1 ')
                  .replace(/<[^>]*>/g, '');
              });
              
              // Clean up any remaining table tags
              return tableContent.replace(/<[^>]*>/g, '') + '\n\n';
            })
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<hr\s*\/?>/gi, '\n---\n\n')
            .replace(/<div[^>]*class="[^"]*endpoint[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '\n**Endpoint:** $1\n')
            .replace(/<span[^>]*class="[^"]*method[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '**$1**')
            .replace(/<[^>]*>/g, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          // Clean up HTML tags (text format)
          formattedContent = mainContent
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Add method filter if specified
        if (method) {
          const methodRegex = new RegExp(method, 'gi');
          if (!methodRegex.test(formattedContent)) {
            formattedContent = `No ${method} endpoints found in the documentation.\n\n${formattedContent}`;
          } else {
            // Try to extract sections that mention the specific method
            const lines = formattedContent.split('\n');
            const relevantLines = lines.filter(line => 
              methodRegex.test(line) || 
              lines.indexOf(line) > 0 && methodRegex.test(lines[lines.indexOf(line) - 1])
            );
            
            if (relevantLines.length > 0) {
              formattedContent = `${method} endpoints:\n\n${relevantLines.join('\n')}\n\n--- Full Documentation ---\n\n${formattedContent}`;
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `API Reference from ${url}:\n\n${formattedContent}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error fetching API reference:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching API reference: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Resource that provides comprehensive information about available documentation
  server.resource(
    "machina-docs-info",
    "https://docs.machina.gg/info",
    { mimeType: "application/json" },
    async (): Promise<ReadResourceResult> => {
      return {
        contents: [
          {
            uri: "https://docs.machina.gg/info",
            text: JSON.stringify({
              description: "Machina Sports Documentation and API Reference",
              baseUrl: "https://docs.machina.gg",
              apiFormat: "https://{api-address}.org.machina.gg",
              version: "2.0.0",
              lastUpdated: new Date().toISOString(),
              
              authentication: {
                description: "All API tools require apiAddress and apiToken parameters",
                apiAddress: {
                  description: "Your organization's API address (e.g., 'entain-organization-sportingbet-blog-trainin')",
                  example: "entain-organization-sportingbet-blog-trainin"
                },
                apiToken: {
                  description: "Your x-api-token for authentication",
                  example: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ"
                }
              },
              
              documentationSections: [
                "introduction",
                "get-access-to-studio", 
                "integrate-sports-data",
                "deploy-sports-agent",
                "machina-studio",
                "agents",
                "connectors", 
                "mappings",
                "workflows",
                "prompts"
              ],
              
              apiEndpoints: {
                agents: {
                  description: "Agent management endpoints",
                  endpoints: [
                    "create-agent",
                    "search-agents", 
                    "execute-agent-by-id",
                    "execute-agent-by-name",
                    "get-agent-by-id",
                    "get-agent-by-name",
                    "update-agent",
                    "delete-agent"
                  ]
                },
                documents: {
                  description: "Document management endpoints",
                  endpoints: [
                    "create-document",
                    "search-documents",
                    "get-document-by-id", 
                    "update-document",
                    "delete-document"
                  ]
                },
                workflows: {
                  description: "Workflow management endpoints",
                  endpoints: [
                    "create-workflow",
                    "search-workflows",
                    "execute-workflow-by-id",
                    "execute-workflow-by-name", 
                    "get-workflow-by-id",
                    "get-workflow-by-name",
                    "get-scheduled-workflow-by-run-id",
                    "update-workflow",
                    "delete-workflow"
                  ]
                }
              },
              
              supportedFormats: ["text", "html", "markdown"],
              supportedMethods: ["GET", "POST", "PUT", "DELETE"],
              
              tools: {
                "get-machina-docs": {
                  description: "Fetch general documentation pages with intelligent content extraction",
                  parameters: ["page", "format"],
                  supportedPages: [
                    "introduction", "get-access-to-studio", "integrate-sports-data",
                    "deploy-sports-agent", "machina-studio", "agents", "connectors",
                    "mappings", "workflows", "prompts"
                  ]
                },
                "get-machina-api-reference": {
                  description: "Fetch API reference documentation with smart endpoint mapping and schema extraction",
                  parameters: ["endpoint", "method", "include_schemas", "format"],
                  features: [
                    "Smart endpoint URL mapping",
                    "HTTP method filtering", 
                    "JSON schema extraction",
                    "Enhanced table parsing",
                    "Multiple output formats"
                  ]
                },
                
                // Agent Management Tools
                "create-agent": {
                  description: "Create a new agent with configurations",
                  parameters: ["name", "title", "description", "context", "workflows", "status"]
                },
                "execute-agent-by-id": {
                  description: "Execute an agent using its unique ID",
                  parameters: ["id", "agentConfig", "input", "context"]
                },
                "execute-agent-by-name": {
                  description: "Execute an agent using its unique name",
                  parameters: ["name", "agentConfig", "input", "context"]
                },
                "get-agent-by-id": {
                  description: "Retrieve an agent by its unique ID",
                  parameters: ["id"]
                },
                "get-agent-by-name": {
                  description: "Retrieve an agent by its unique name",
                  parameters: ["name"]
                },
                "search-agents": {
                  description: "Search for agents with filters and pagination",
                  parameters: ["filters", "sorters", "page", "pageSize"]
                },
                "update-agent": {
                  description: "Update an existing agent by its ID",
                  parameters: ["id", "title", "description", "status", "context", "workflows"]
                },
                "delete-agent": {
                  description: "Delete an agent by its ID",
                  parameters: ["id"]
                },
                
                // Document Management Tools
                "create-document": {
                  description: "Create a new document with metadata",
                  parameters: ["name", "value", "metadata", "status", "embedVector"]
                },
                "get-document-by-id": {
                  description: "Retrieve a document by its unique ID",
                  parameters: ["id"]
                },
                "update-document": {
                  description: "Update an existing document by its ID",
                  parameters: ["id", "value", "metadata", "status"]
                },
                "delete-document": {
                  description: "Delete a document by its ID",
                  parameters: ["id"]
                },
                "search-documents": {
                  description: "Search for documents with filters and pagination",
                  parameters: ["filters", "sorters", "page", "pageSize"]
                },
                
                // Workflow Management Tools
                "create-workflow": {
                  description: "Create a new workflow with tasks and configurations",
                  parameters: ["name", "title", "description", "contextVariables", "inputs", "outputs", "tasks", "status"]
                },
                "get-workflow-by-id": {
                  description: "Retrieve a workflow by its unique ID",
                  parameters: ["id"]
                },
                "get-workflow-by-name": {
                  description: "Retrieve a workflow by its unique name",
                  parameters: ["name"]
                },
                "update-workflow": {
                  description: "Update an existing workflow by its ID",
                  parameters: ["id", "title", "description", "status", "context", "inputs", "outputs"]
                },
                "delete-workflow": {
                  description: "Delete a workflow by its ID",
                  parameters: ["id"]
                },
                "search-workflows": {
                  description: "Search for workflows with filters and pagination",
                  parameters: ["filters", "sorters", "page", "pageSize"]
                },
                "execute-workflow-by-id": {
                  description: "Execute a workflow by its unique ID",
                  parameters: ["id", "skipDelay", "input", "context"]
                },
                "execute-workflow-by-name": {
                  description: "Execute a workflow by its unique name",
                  parameters: ["name", "skipDelay", "input", "context"]
                },
                "execute-workflow-immediate": {
                  description: "Execute a workflow immediately by its name",
                  parameters: ["name", "context"]
                },
                "get-scheduled-workflow": {
                  description: "Get scheduled workflow execution details",
                  parameters: ["workflowRunId"]
                }
              },
              
              usage: {
                examples: [
                  {
                    tool: "get-machina-docs",
                    description: "Get introduction documentation in markdown format",
                    parameters: {
                      page: "introduction",
                      format: "markdown"
                    }
                  },
                  {
                    tool: "get-machina-api-reference", 
                    description: "Get agent creation API reference with schemas",
                    parameters: {
                      endpoint: "create-agent",
                      include_schemas: true,
                      format: "markdown"
                    }
                  },
                  {
                    tool: "create-agent",
                    description: "Create a simple agent",
                    parameters: {
                      apiAddress: "entain-organization-sportingbet-blog-trainin",
                      apiToken: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ",
                      name: "my-sports-agent",
                      title: "Sports Analysis Agent",
                      description: "An agent for analyzing sports data",
                      status: "active"
                    }
                  },
                  {
                    tool: "search-agents",
                    description: "Search for active agents",
                    parameters: {
                      apiAddress: "entain-organization-sportingbet-blog-trainin",
                      apiToken: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ",
                      filters: { status: "active" },
                      page: 1,
                      pageSize: 10
                    }
                  },
                  {
                    tool: "create-document",
                    description: "Create a document with sports data",
                    parameters: {
                      apiAddress: "entain-organization-sportingbet-blog-trainin",
                      apiToken: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ",
                      name: "game-analysis-doc",
                      value: { game: "Lakers vs Warriors", score: "110-98" },
                      metadata: { sport: "basketball", season: "2024" },
                      status: "active"
                    }
                  },
                  {
                    tool: "create-workflow",
                    description: "Create a workflow for sports data processing",
                    parameters: {
                      apiAddress: "entain-organization-sportingbet-blog-trainin",
                      apiToken: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ",
                      name: "sports-data-workflow",
                      title: "Sports Data Processing Workflow",
                      description: "Process and analyze sports data",
                      outputs: { "workflow-status": "executed" },
                      status: "active"
                    }
                  },
                  {
                    tool: "execute-agent-by-name",
                    description: "Execute an agent with input data",
                    parameters: {
                      apiAddress: "entain-organization-sportingbet-blog-trainin",
                      apiToken: "tzDkqVqXvPSBX_UFFY5UzJYc4CEwFmhHqkz8qfW5uaXw1fCWQA-p05i4jWsJFCROnyzoLxxY1x0Ur8XACa9VhQ",
                      name: "my-sports-agent",
                      input: { team: "Lakers", opponent: "Warriors" },
                      context: { season: "2024", league: "NBA" }
                    }
                  }
                ]
              }
            }, null, 2),
          },
        ],
      };
    }
  );

  return server;
};
