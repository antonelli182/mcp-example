import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import "fetch-to-node";

export const setupMCPServer = (): McpServer => {

  const server = new McpServer(
    {
      name: "machina-docs-server",
      version: "1.0.0",
    },
    { capabilities: { logging: {} } }
  );

  // Register a prompt template that allows the server to
  // provide the context structure and (optionally) the variables
  // that should be placed inside of the prompt for client to fill in.
  server.prompt(
    "greeting-template",
    "A simple greeting prompt template",
    {
      name: z.string().describe("Name to include in greeting"),
    },
    async ({ name }): Promise<GetPromptResult> => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please greet ${name} in a friendly manner.`,
            },
          },
        ],
      };
    }
  );

  // Register a documentation tool to fetch Machina documentation
  server.tool(
    "get-machina-docs",
    "Fetches documentation from docs.machina.gg",
    {
      page: z
        .string()
        .describe("The specific page or section to fetch (default is 'introduction')")
        .default("introduction"),
    },
    async ({ page }, { sendNotification }): Promise<CallToolResult> => {
      try {
        // Notify the client that we're starting to fetch documentation
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
        
        // Extract the main content (this is a simple extraction and may need refinement)
        // For a real implementation, you might need a proper HTML parser
        const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const mainContent = mainContentMatch ? mainContentMatch[1] : html;
        
        // Clean up HTML tags (basic cleanup, could be improved)
        const cleanContent = mainContent
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          content: [
            {
              type: "text",
              text: `Documentation from ${url}:\n\n${cleanContent}`,
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

  // Register a tool for browsing and suggesting Machina templates from GitHub
  server.tool(
    "browse-machina-templates",
    "Browses and suggests Machina templates from the GitHub repository",
    {
      category: z
        .enum(["all", "reporter", "sport-specific", "brand-specific", "general"])
        .describe("The category of templates to browse (default is 'all')")
        .default("all"),
      sport: z
        .string()
        .describe("The sport type to filter by (e.g., 'soccer', 'nba', 'nfl')")
        .optional(),
      use_case: z
        .string()
        .describe("The specific use case (e.g., 'recap', 'quiz', 'poll', 'image')")
        .optional(),
      language: z
        .string()
        .describe("The language of the template (e.g., 'en', 'es', 'pt-br')")
        .optional(),
      content_type: z
        .enum(["templates", "connectors", "both"])
        .describe("Whether to browse templates, connectors, or both")
        .default("both"),
      fetch_content: z
        .boolean()
        .describe("Whether to fetch the actual content of the templates/connectors")
        .default(false),
    },
    async ({ category, sport, use_case, language, content_type, fetch_content }, { sendNotification }): Promise<CallToolResult> => {
      try {
        // Notify that we're starting to fetch the repository data
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Fetching Machina templates from GitHub repository...`,
          },
        });

        // GitHub API URLs for fetching repository content
        const apiBaseUrl = "https://api.github.com/repos/machina-sports/machina-templates";
        
        // Function to fetch repository content
        async function fetchRepoContent(path: string) {
          const url = `${apiBaseUrl}/contents/${path}`;
          const response = await fetch(url, {
            headers: {
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "MachinaDocsFetcher"
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch GitHub content for ${path}: ${response.statusText}`);
          }
          
          return await response.json();
        }

        // Function to fetch file content
        async function fetchFileContent(url: string) {
          const response = await fetch(url, {
            headers: {
              "Accept": "application/vnd.github.v3.raw",
              "User-Agent": "MachinaDocsFetcher"
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch file content: ${response.statusText}`);
          }
          
          return await response.text();
        }

        // Function to filter templates by criteria
        function filterTemplates(templates: any[], criteria: { category?: string, sport?: string, use_case?: string, language?: string }) {
          return templates.filter(template => {
            const name = template.name.toLowerCase();
            
            // Filter by category
            if (criteria.category && criteria.category !== 'all') {
              if (criteria.category === 'reporter' && !name.includes('reporter-')) return false;
              if (criteria.category === 'sport-specific' && 
                  !(name.includes('sport') || name.includes('nba') || name.includes('soccer') || 
                    name.includes('nfl') || name.includes('rugby'))) return false;
              if (criteria.category === 'brand-specific' && 
                  !(name.includes('dazn') || name.includes('estelarbet') || 
                    name.includes('sportingbet'))) return false;
              if (criteria.category === 'general' && 
                  (name.includes('reporter-') || name.includes('sport') || 
                   name.includes('nba') || name.includes('dazn'))) return false;
            }
            
            // Filter by sport
            if (criteria.sport && !name.includes(criteria.sport.toLowerCase())) return false;
            
            // Filter by use case
            if (criteria.use_case && !name.includes(criteria.use_case.toLowerCase())) return false;
            
            // Filter by language
            if (criteria.language) {
              if (criteria.language === 'en' && name.includes('-en')) return true;
              if (criteria.language === 'es' && name.includes('-es')) return true;
              if (criteria.language === 'pt-br' && name.includes('-pt-br')) return true;
              if (!name.includes(`-${criteria.language}`)) return false;
            }
            
            return true;
          });
        }

        // Collect data based on content_type
        let templates: any[] = [];
        let connectors: any[] = [];
        
        // Progress notification
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Collecting repository structure...`,
          },
        });

        // Fetch templates if needed
        if (content_type === 'templates' || content_type === 'both') {
          try {
            const templatesList = await fetchRepoContent('agent-templates');
            templates = filterTemplates(templatesList, { category, sport, use_case, language });
            
            // Fetch template content if requested
            if (fetch_content && templates.length > 0) {
              for (let i = 0; i < Math.min(templates.length, 5); i++) { // Limit to 5 to avoid rate limits
                await sendNotification({
                  method: "notifications/message",
                  params: {
                    level: "info",
                    data: `Fetching content for template: ${templates[i].name}...`,
                  },
                });
                
                // Fetch directory content first to find YAML files
                const templateFiles = await fetchRepoContent(`agent-templates/${templates[i].name}`);
                const yamlFiles = templateFiles.filter((file: any) => 
                  file.name.endsWith('.yaml') || file.name.endsWith('.yml'));
                
                if (yamlFiles.length > 0) {
                  // Fetch content of the first YAML file found
                  templates[i].content = await fetchFileContent(yamlFiles[0].download_url);
                }
              }
            }
          } catch (error: any) {
            console.error("Error fetching templates:", error);
            await sendNotification({
              method: "notifications/message",
              params: {
                level: "warning",
                data: `Error fetching templates: ${error.message}`,
              },
            });
          }
        }

        // Fetch connectors if needed
        if (content_type === 'connectors' || content_type === 'both') {
          try {
            connectors = await fetchRepoContent('connectors');
            
            // Filter connectors based on sport if specified
            if (sport) {
              connectors = connectors.filter((connector: any) => 
                connector.name.toLowerCase().includes(sport.toLowerCase()));
            }
            
            // Fetch connector content if requested
            if (fetch_content && connectors.length > 0) {
              for (let i = 0; i < Math.min(connectors.length, 5); i++) { // Limit to 5 to avoid rate limits
                await sendNotification({
                  method: "notifications/message",
                  params: {
                    level: "info",
                    data: `Fetching content for connector: ${connectors[i].name}...`,
                  },
                });
                
                // Fetch directory content first to find main connector files
                const connectorFiles = await fetchRepoContent(`connectors/${connectors[i].name}`);
                const mainFiles = connectorFiles.filter((file: any) => 
                  file.name.startsWith(connectors[i].name) || file.name === 'connector.yaml');
                
                if (mainFiles.length > 0) {
                  // Fetch content of the first main file found
                  connectors[i].content = await fetchFileContent(mainFiles[0].download_url);
                }
              }
            }
          } catch (error: any) {
            console.error("Error fetching connectors:", error);
            await sendNotification({
              method: "notifications/message",
              params: {
                level: "warning",
                data: `Error fetching connectors: ${error.message}`,
              },
            });
          }
        }

        // Generate suggestions based on the filtered results
        let suggestions = [];
        
        if (templates.length > 0) {
          const categoryName = category === 'all' ? 'various categories' : `${category} category`;
          const sportText = sport ? ` for ${sport}` : '';
          const useCaseText = use_case ? ` related to ${use_case}` : '';
          const languageText = language ? ` in ${language}` : '';
          
          suggestions.push(`Based on your criteria, here are recommended templates from ${categoryName}${sportText}${useCaseText}${languageText}:`);
          
          templates.forEach((template: any) => {
            const description = inferTemplateDescription(template.name);
            suggestions.push(`- ${template.name}: ${description}`);
          });
        } else {
          suggestions.push("No templates found matching your criteria.");
        }
        
        if (connectors.length > 0 && (content_type === 'connectors' || content_type === 'both')) {
          suggestions.push("\nRelated connectors that may be useful:");
          
          connectors.forEach((connector: any) => {
            const description = inferConnectorDescription(connector.name);
            suggestions.push(`- ${connector.name}: ${description}`);
          });
        }

        // Add usage instructions
        suggestions.push("\nTo use these templates:");
        suggestions.push("1. Install required connectors from the 'connectors' directory");
        suggestions.push("2. Configure necessary environment variables in your Machina environment");
        suggestions.push("3. Import the template workflows into your Machina instance");
        
        return {
          content: [
            {
              type: "text",
              text: suggestions.join("\n"),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error browsing Machina templates:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error browsing Machina templates: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for converting Machina templates to custom agents
  server.tool(
    "convert-template-to-agent",
    "Converts a Machina template to a customized agent configuration",
    {
      template_name: z
        .string()
        .describe("The name of the template to convert (e.g., 'soccer-match-recap-en')"),
      agent_name: z
        .string()
        .describe("The name for the new agent"),
      agent_description: z
        .string()
        .describe("A short description of the agent's purpose")
        .optional(),
      parameters: z
        .record(z.any())
        .describe("Custom parameters to apply to the template (format depends on the specific template)")
        .optional(),
      language: z
        .string()
        .describe("The language for the agent (e.g., 'en', 'es', 'pt-br')")
        .default("en"),
      output_format: z
        .enum(["yaml", "json"])
        .describe("The output format for the agent configuration")
        .default("yaml"),
    },
    async ({ template_name, agent_name, agent_description, parameters, language, output_format }, { sendNotification }): Promise<CallToolResult> => {
      try {
        // Notify that we're starting the template conversion
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Starting conversion of template "${template_name}" to agent "${agent_name}"...`,
          },
        });

        // GitHub API URLs for fetching repository content
        const apiBaseUrl = "https://api.github.com/repos/machina-sports/machina-templates";
        
        // Function to fetch repository content
        async function fetchRepoContent(path: string) {
          const url = `${apiBaseUrl}/contents/${path}`;
          const response = await fetch(url, {
            headers: {
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "MachinaTemplateConverter"
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch GitHub content for ${path}: ${response.statusText}`);
          }
          
          return await response.json();
        }

        // Function to fetch file content
        async function fetchFileContent(url: string) {
          const response = await fetch(url, {
            headers: {
              "Accept": "application/vnd.github.v3.raw",
              "User-Agent": "MachinaTemplateConverter"
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch file content: ${response.statusText}`);
          }
          
          return await response.text();
        }

        // Check if the template exists
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Searching for template "${template_name}"...`,
          },
        });

        // Fetch all templates to find the requested one
        const templatesList = await fetchRepoContent('agent-templates');
        const templateMatch = templatesList.find((template: any) => 
          template.name.toLowerCase() === template_name.toLowerCase());
        
        if (!templateMatch) {
          throw new Error(`Template "${template_name}" not found. Please use the browse-machina-templates tool to find available templates.`);
        }

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Template found! Fetching template files...`,
          },
        });

        // Fetch template directory contents to find YAML/configuration files
        const templateFiles = await fetchRepoContent(`agent-templates/${templateMatch.name}`);
        const configFiles = templateFiles.filter((file: any) => 
          file.name.endsWith('.yaml') || file.name.endsWith('.yml') || 
          file.name.endsWith('.json'));
        
        if (configFiles.length === 0) {
          throw new Error(`No configuration files found in template "${template_name}"`);
        }

        // Fetch the configuration file content
        const configFile = configFiles[0]; // Take the first config file
        const configContent = await fetchFileContent(configFile.download_url);
        
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Analyzing template configuration...`,
          },
        });

        // Determine if YAML or JSON and parse accordingly
        let templateConfig: any;
        let isYaml = false;
        
        if (configFile.name.endsWith('.yaml') || configFile.name.endsWith('.yml')) {
          isYaml = true;
          // For YAML parsing, we'll use a simple regex-based approach since we don't have a YAML library
          // In a production environment, you would use a proper YAML library
          templateConfig = parseSimpleYaml(configContent);
        } else {
          templateConfig = JSON.parse(configContent);
        }

        // Extract available parameters from the template
        const availableParams = extractTemplateParameters(templateConfig);
        
        // Check if we need to request additional parameters from the user
        if (availableParams.length > 0 && (!parameters || Object.keys(parameters).length === 0)) {
          return {
            content: [
              {
                type: "text",
                text: `Template "${template_name}" requires the following parameters:\n\n` +
                      availableParams.map(param => `- ${param.name}: ${param.description || 'No description'}`).join('\n') + 
                      `\n\nPlease call this tool again with the "parameters" field populated with values for these parameters.`,
              },
            ],
          };
        }

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Applying customizations and generating agent configuration...`,
          },
        });

        // Apply user parameters to the template
        const customizedConfig = applyParameters(templateConfig, parameters, {
          name: agent_name,
          description: agent_description || inferTemplateDescription(template_name),
          language: language
        });

        // Convert the configuration to the requested output format
        let outputConfig: string;
        
        if (output_format === 'yaml' && !isYaml) {
          outputConfig = convertJsonToYaml(customizedConfig);
        } else if (output_format === 'json' && isYaml) {
          outputConfig = JSON.stringify(customizedConfig, null, 2);
        } else {
          // Same format as input
          outputConfig = isYaml ? 
            convertJsonToYaml(customizedConfig) : 
            JSON.stringify(customizedConfig, null, 2);
        }

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Successfully created agent "${agent_name}" from template "${template_name}"!`,
          },
        });

        // Return the generated agent configuration
        return {
          content: [
            {
              type: "text",
              text: `# ${agent_name} Agent Configuration\n` +
                    `Generated from template: ${template_name}\n\n` +
                    `## Configuration (${output_format.toUpperCase()}):\n\n` +
                    "```" + output_format + "\n" +
                    outputConfig + 
                    "\n```\n\n" +
                    "## Next Steps:\n" +
                    "1. Save this configuration to a file named `" + agent_name.toLowerCase().replace(/\s+/g, '-') + "." + output_format + "`\n" +
                    "2. Import the configuration into your Machina instance\n" +
                    "3. Configure any required connectors\n" +
                    "4. Test your new agent with sample data\n\n" +
                    "For more information on deploying agents, visit: https://docs.machina.gg/deploy-sports-agent",
            },
          ],
        };
      } catch (error: any) {
        console.error("Error converting template to agent:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error converting template to agent: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Helper function to parse simple YAML (basic implementation)
  function parseSimpleYaml(yamlString: string): any {
    const result: any = {};
    const lines = yamlString.split('\n');
    let currentSection: any = result;
    let sectionStack: any[] = [result];
    let indentLevel = 0;
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') continue;
      
      // Calculate indentation level
      const currentIndent = line.search(/\S/);
      if (currentIndent === -1) continue; // Skip completely empty lines
      
      // Handle indentation changes
      if (currentIndent > indentLevel) {
        indentLevel = currentIndent;
      } else if (currentIndent < indentLevel) {
        // Going back up in the hierarchy
        const levelsUp = Math.floor((indentLevel - currentIndent) / 2);
        for (let i = 0; i < levelsUp; i++) {
          sectionStack.pop();
        }
        currentSection = sectionStack[sectionStack.length - 1];
        indentLevel = currentIndent;
      }
      
      // Parse the current line
      if (line.includes(':')) {
        const [key, value] = line.split(':', 2).map(part => part.trim());
        if (!key) continue;
        
        if (!value || value === '') {
          // This is a new section
          currentSection[key] = {};
          sectionStack.push(currentSection[key]);
          currentSection = currentSection[key];
        } else {
          // This is a key-value pair
          // Handle quoted values
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            currentSection[key] = value.substring(1, value.length - 1);
          } 
          // Handle boolean values
          else if (value === 'true' || value === 'false') {
            currentSection[key] = value === 'true';
          } 
          // Handle numeric values
          else if (!isNaN(Number(value))) {
            currentSection[key] = Number(value);
          } 
          // Handle null values
          else if (value === 'null') {
            currentSection[key] = null;
          } 
          // Handle arrays
          else if (value.startsWith('[') && value.endsWith(']')) {
            try {
              currentSection[key] = JSON.parse(value);
            } catch (e) {
              currentSection[key] = value; // fallback to string if parsing fails
            }
          } 
          // Default to string
          else {
            currentSection[key] = value;
          }
        }
      } else if (line.trim().startsWith('-')) {
        // This is a list item, but we'll handle it simply for now
        const listItem = line.trim().substring(1).trim();
        if (!currentSection.items) {
          currentSection.items = [];
        }
        currentSection.items.push(listItem);
      }
    }
    
    return result;
  }

  // Helper function to convert JSON to a simple YAML format
  function convertJsonToYaml(json: any, indent: number = 0): string {
    const indentStr = ' '.repeat(indent);
    let yamlStr = '';
    
    if (typeof json !== 'object' || json === null) {
      // For primitive values
      if (typeof json === 'string') {
        // Check if we need quotes (special characters or spaces)
        if (json.includes('\n') || json.includes(':') || json.includes('#') || 
            json.trim() !== json || json === '') {
          yamlStr += `"${json.replace(/"/g, '\\"')}"`;
        } else {
          yamlStr += json;
        }
      } else {
        yamlStr += String(json);
      }
    } else if (Array.isArray(json)) {
      // For arrays
      if (json.length === 0) {
        yamlStr += '[]';
      } else {
        for (const item of json) {
          yamlStr += `\n${indentStr}- `;
          
          if (typeof item === 'object' && item !== null) {
            // For nested objects in arrays, increase indentation
            const nestedYaml = convertJsonToYaml(item, indent + 2);
            if (nestedYaml.startsWith('\n')) {
              yamlStr += nestedYaml.substring(1); // Skip the first newline
            } else {
              yamlStr += nestedYaml;
            }
          } else {
            yamlStr += convertJsonToYaml(item, 0); // No indentation for primitives
          }
        }
      }
    } else {
      // For objects
      const keys = Object.keys(json);
      if (keys.length === 0) {
        yamlStr += '{}';
      } else {
        for (const key of keys) {
          const value = json[key];
          yamlStr += `\n${indentStr}${key}: `;
          
          if (typeof value === 'object' && value !== null) {
            // For nested objects, increase indentation
            const nestedYaml = convertJsonToYaml(value, indent + 2);
            if (nestedYaml.startsWith('\n')) {
              yamlStr += nestedYaml; // Keep the first newline
            } else {
              yamlStr += nestedYaml;
            }
          } else {
            yamlStr += convertJsonToYaml(value, 0); // No indentation for primitives
          }
        }
      }
    }
    
    return yamlStr;
  }

  // Extract parameter definitions from a template configuration
  function extractTemplateParameters(config: any): Array<{ name: string, description: string }> {
    const parameters: Array<{ name: string, description: string }> = [];
    
    // This function recursively scans the configuration object for parameter placeholders
    function scanForParameters(obj: any, path: string = '') {
      if (!obj || typeof obj !== 'object') return;
      
      // Check if this is an array
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          scanForParameters(item, `${path}[${index}]`);
        });
        return;
      }
      
      // Look for objects with parameter definitions
      if (obj.type === 'parameter' || obj.__placeholder === true) {
        parameters.push({
          name: path || obj.name || 'unknown',
          description: obj.description || `Parameter for ${path}`
        });
        return;
      }
      
      // Recursively scan object properties
      for (const key in obj) {
        scanForParameters(obj[key], path ? `${path}.${key}` : key);
      }
    }
    
    scanForParameters(config);
    
    return parameters;
  }

  // Apply parameters to the template configuration
  function applyParameters(config: any, userParams: any = {}, agentInfo: { name: string, description: string, language: string }): any {
    // Create a deep copy of the config
    const result = JSON.parse(JSON.stringify(config));
    
    // Set basic agent properties if present in the configuration
    if (result.name !== undefined) {
      result.name = agentInfo.name;
    }
    
    if (result.description !== undefined) {
      result.description = agentInfo.description;
    }
    
    // This function recursively replaces parameter placeholders with user values
    function replaceParameters(obj: any): any {
      if (!obj || typeof obj !== 'object') return obj;
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => replaceParameters(item));
      }
      
      // Check if this is a parameter placeholder
      if (obj.type === 'parameter' || obj.__placeholder === true) {
        const paramName = obj.name || '';
        if (userParams && userParams[paramName] !== undefined) {
          // If this is a complex parameter with children, merge rather than replace
          if (typeof userParams[paramName] === 'object' && typeof obj.default === 'object') {
            return {
              ...obj.default,
              ...userParams[paramName]
            };
          }
          return userParams[paramName];
        }
        return obj.default !== undefined ? obj.default : obj;
      }
      
      // Process regular objects
      const newObj: any = {};
      for (const key in obj) {
        newObj[key] = replaceParameters(obj[key]);
      }
      return newObj;
    }
    
    return replaceParameters(result);
  }

  // Create a resource that provides information about available documentation
  server.resource(
    "machina-docs-resource",
    "https://docs.machina.gg/api-info",
    { mimeType: "application/json" },
    async (): Promise<ReadResourceResult> => {
      return {
        contents: [
          {
            uri: "https://docs.machina.gg/api-info",
            text: JSON.stringify({
              description: "Machina Documentation API",
              baseUrl: "https://docs.machina.gg",
              availableSections: [
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
              templateBrowser: {
                description: "Machina Template Browser Tool",
                tool: "browse-machina-templates",
                categories: ["all", "reporter", "sport-specific", "brand-specific", "general"],
                commonSports: ["soccer", "nba", "nfl", "rugby"],
                commonUseCases: ["recap", "quiz", "poll", "image", "summary", "briefing", "websearch"],
                languages: ["en", "es", "pt-br"],
                contentTypes: ["templates", "connectors", "both"]
              },
              templateToAgent: {
                description: "Machina Template to Agent Conversion Tool",
                tool: "convert-template-to-agent",
                requiredParameters: ["template_name", "agent_name"],
                optionalParameters: ["agent_description", "parameters", "language", "output_format"],
                supportedOutputFormats: ["yaml", "json"],
                workflow: [
                  "Browse available templates using browse-machina-templates",
                  "Select a template and provide a name for your new agent",
                  "Customize parameters specific to the template",
                  "Generate agent configuration in YAML or JSON format"
                ]
              }
            }, null, 2),
          },
        ],
      };
    }
  );

  // Helper function to infer template descriptions based on the template name
  function inferTemplateDescription(templateName: string): string {
    const name = templateName.toLowerCase();
    
    // Reporter templates
    if (name.includes('reporter-summary')) return 'Generates game summaries';
    if (name.includes('reporter-briefing')) return 'Creates pre-game briefings';
    if (name.includes('reporter-polls')) return 'Generates interactive polls';
    if (name.includes('reporter-quizzes')) return 'Creates sports quizzes';
    if (name.includes('reporter-image')) return 'Generates sports-related images';
    if (name.includes('reporter-websearch')) return 'Researches web content for sports events';
    if (name.includes('reporter-recap')) return 'Creates post-game recaps';
    
    // Sport-specific templates
    if (name.includes('nba')) return 'NBA-specific content workflows';
    if (name.includes('soccer')) return 'Soccer data processing workflows';
    if (name.includes('superbowl')) return 'NFL Super Bowl specific templates';
    if (name.includes('fantasy')) return 'Fantasy sports content';
    
    // Brand-specific templates
    if (name.includes('estelarbet')) return 'Templates for Estelarbet brand';
    if (name.includes('dazn')) return 'Templates for DAZN';
    if (name.includes('sportingbet-blog')) return 'Blog content for Sportingbet';
    
    // General templates
    if (name.includes('chat-completion')) return 'Generic chat completion workflows';
    if (name.includes('gameday')) return 'Game day content generation';
    if (name.includes('quizzes')) return 'Generic sports quiz templates';
    
    return 'Sports content workflow template';
  }
  
  // Helper function to infer connector descriptions based on the connector name
  function inferConnectorDescription(connectorName: string): string {
    const name = connectorName.toLowerCase();
    
    // AI services
    if (name.includes('openai')) return 'OpenAI API integration for AI capabilities';
    if (name.includes('groq')) return 'Groq API integration for fast inference';
    if (name.includes('perplexity')) return 'Perplexity API for web search capabilities';
    if (name.includes('vertex')) return 'Google Vertex AI integration';
    if (name.includes('stability')) return 'Stability AI for image generation';
    
    // Sports data
    if (name.includes('sportradar-soccer')) return 'Soccer data API integration';
    if (name.includes('sportradar-nba')) return 'NBA data API integration';
    if (name.includes('sportradar-nfl')) return 'NFL data API integration';
    if (name.includes('sportradar-rugby')) return 'Rugby data API integration';
    if (name.includes('sportingbet')) return 'Sports betting data integration';
    
    // Utilities
    if (name.includes('storage')) return 'Data storage connector';
    if (name.includes('machina-db')) return 'Database connector for Machina';
    if (name.includes('search')) return 'Search functionality connector';
    if (name.includes('docling')) return 'Document processing connector';
    
    return 'Integration connector for Machina workflows';
  }
  
  return server;
};
