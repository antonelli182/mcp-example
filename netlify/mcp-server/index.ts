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
