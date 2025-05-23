import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import "fetch-to-node";
import yaml from "js-yaml";

export const setupMCPServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "machina-sports-server",
      version: "1.0.0",
    },
    { capabilities: { logging: {} } }
  );

  // Register a documentation tool to fetch Machina documentation
  server.tool(
    "get-machina-docs",
    "Fetches comprehensive documentation from docs.machina.gg",
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
        
        // Extract the main content
        const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const mainContent = mainContentMatch ? mainContentMatch[1] : html;
        
        let formattedContent;
        
        // Format content based on requested format
        if (format === "html") {
          formattedContent = mainContent;
        } else if (format === "markdown") {
          // Simple HTML to Markdown conversion (could be enhanced with an HTML-to-MD library)
          formattedContent = mainContent
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '* $1\n')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<[^>]*>/g, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n');
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

  // Register a tool for browsing and suggesting Machina templates from GitHub
  server.tool(
    "browse-machina-templates",
    "Browses and suggests Machina templates from the GitHub repository",
    {
      category: z
        .string()
        .describe("The category of templates to browse (all, reporter, sport-specific, brand-specific, general)")
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
        .string()
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
            
            // Include template content if available
            if (template.content) {
              suggestions.push("\nTemplate content:");
              suggestions.push("```yaml");
              suggestions.push(template.content.substring(0, 800) + (template.content.length > 800 ? "...\n(content truncated)" : ""));
              suggestions.push("```");
            }
          });
        } else {
          suggestions.push("No templates found matching your criteria.");
        }
        
        if (connectors.length > 0 && (content_type === 'connectors' || content_type === 'both')) {
          suggestions.push("\nRelated connectors that may be useful:");
          
          connectors.forEach((connector: any) => {
            const description = inferConnectorDescription(connector.name);
            suggestions.push(`- ${connector.name}: ${description}`);
            
            // Include connector content if available
            if (connector.content) {
              suggestions.push("\nConnector definition:");
              suggestions.push("```yaml");
              suggestions.push(connector.content.substring(0, 800) + (connector.content.length > 800 ? "...\n(content truncated)" : ""));
              suggestions.push("```");
            }
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

  // Tool for generating new agent templates
  server.tool(
    "generate-agent-template",
    "Generates a new Machina agent template based on provided specifications",
    {
      name: z.string().describe("Name of the template (e.g., 'soccer-recap-reporter')"),
      description: z.string().describe("Description of what the agent does"),
      sport: z.string().describe("Sport the agent is focused on (e.g., 'soccer', 'nba', 'nfl')"),
      use_case: z.string().describe("Primary use case (e.g., 'recap', 'quiz', 'poll', 'prediction')"),
      language: z.string().describe("Language of the agent (en, es, pt-br)").default("en"),
      data_sources: z.string().describe("Comma-separated list of data sources/connectors").default(""),
      output_format: z.string().describe("Output format (text, json, markdown, html)").default("text"),
      include_examples: z.boolean().describe("Whether to include example prompts").default(true),
    },
    async ({ name, description, sport, use_case, language, data_sources, output_format, include_examples }): Promise<CallToolResult> => {
      try {
        // Generate a sanitized template name if not provided
        const templateName = name || `${sport}-${use_case}-${language}`;
        const sanitizedName = templateName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        // Parse data sources and determine appropriate connectors
        const dataSources = data_sources ? data_sources.split(',').map(s => s.trim()) : [];
        const connectors = determineConnectors(sport, use_case, dataSources);
        
        // Generate workflow name
        const workflowName = `workflow-${sanitizedName}`;
        const promptName = `prompt-${sanitizedName}`;
        
        // Create the main workflow YAML
        const workflowYaml = generateWorkflowYaml(workflowName, sanitizedName, description, sport, use_case, language, connectors, output_format);
        
        // Create the prompt YAML
        const promptYaml = generatePromptYaml(promptName, description, sport, use_case, language, output_format, include_examples);
        
        // Create the install YAML
        const installYaml = generateInstallYaml(promptName, workflowName);
        
        // Create comprehensive documentation
        const documentation = generateDocumentation(templateName, description, sport, use_case, language, connectors, output_format);
        
        return {
          content: [
            {
              type: "text",
              text: `# Generated Machina Agent Template: ${templateName}

${documentation}

## File Structure

Save the following files in a directory named \`${sanitizedName}/\`:

### 1. _install.yml
\`\`\`yaml
${installYaml}
\`\`\`

### 2. ${workflowName}.yml
\`\`\`yaml
${workflowYaml}
\`\`\`

### 3. ${promptName}.yml
\`\`\`yaml
${promptYaml}
\`\`\`

## Deployment Instructions

1. Create a new directory in your agent-templates folder: \`agent-templates/${sanitizedName}/\`
2. Save the three YAML files above in that directory
3. Ensure you have the required connectors installed and configured:
${connectors.map(connector => `   - ${connector}`).join('\n')}
4. Upload the template to your Machina Studio instance
5. Configure the required environment variables and API keys
6. Test the workflow with sample data

## Customization Options

- Modify the prompt schema to add custom fields
- Adjust the workflow tasks to include additional data processing steps
- Add conditional logic for different scenarios
- Integrate with additional connectors as needed
- Customize the output format and structure

Your agent is now ready for deployment and can be further customized based on your specific requirements!`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating agent template:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error generating agent template: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Helper function to determine appropriate connectors based on sport and use case
  function determineConnectors(sport: string, useCase: string, dataSources: string[]): string[] {
    const connectors = new Set<string>();
    
    // Always include OpenAI for general AI capabilities
    connectors.add("openai");
    
    // Add sport-specific data connectors
    if (sport.toLowerCase().includes('soccer')) {
      connectors.add("sportradar-soccer");
    } else if (sport.toLowerCase().includes('nba')) {
      connectors.add("sportradar-nba");
    } else if (sport.toLowerCase().includes('nfl')) {
      connectors.add("sportradar-nfl");
    } else if (sport.toLowerCase().includes('mlb')) {
      connectors.add("sportradar-mlb");
    } else if (sport.toLowerCase().includes('f1')) {
      connectors.add("fastf1");
    } else if (sport.toLowerCase().includes('rugby')) {
      connectors.add("sportradar-rugby");
    }
    
    // Add use case specific connectors
    if (useCase.toLowerCase().includes('image')) {
      connectors.add("stability");
    }
    if (useCase.toLowerCase().includes('search') || useCase.toLowerCase().includes('web')) {
      connectors.add("perplexity");
    }
    if (useCase.toLowerCase().includes('betting') || useCase.toLowerCase().includes('prediction')) {
      connectors.add("tallysight");
    }
    
    // Add any explicitly requested data sources
    dataSources.forEach(source => {
      if (source && source.trim()) {
        connectors.add(source.trim());
      }
    });
    
    return Array.from(connectors);
  }

  // Helper function to generate workflow YAML
  function generateWorkflowYaml(workflowName: string, templateName: string, description: string, sport: string, useCase: string, language: string, connectors: string[], outputFormat: string): string {
    const hasDataConnector = connectors.some(c => c.includes('sportradar') || c.includes('fastf1') || c.includes('mlb'));
    const hasImageGeneration = connectors.includes('stability');
    const hasWebSearch = connectors.includes('perplexity');
    
    const workflow = {
      workflow: {
        name: workflowName,
        title: `${sport.charAt(0).toUpperCase() + sport.slice(1)} ${useCase.charAt(0).toUpperCase() + useCase.slice(1)} Agent`,
        description: description,
        "context-variables": {
          openai: {
            api_key: "$MACHINA_CONTEXT_VARIABLE_OPENAI_API_KEY"
          },
          ...(connectors.includes('groq') && {
            groq: {
              api_key: "$MACHINA_CONTEXT_VARIABLE_GROQ_API_KEY"
            }
          }),
          ...(hasDataConnector && {
            sportradar: {
              api_key: "$MACHINA_CONTEXT_VARIABLE_SPORTRADAR_API_KEY"
            }
          }),
          ...(hasImageGeneration && {
            stability: {
              api_key: "$MACHINA_CONTEXT_VARIABLE_STABILITY_API_KEY"
            }
          }),
          ...(hasWebSearch && {
            perplexity: {
              api_key: "$MACHINA_CONTEXT_VARIABLE_PERPLEXITY_API_KEY"
            }
          })
        },
        inputs: {
          event_code: "$.get('event_code', None)",
          entity_name: "$.get('entity_name', '')",
          date_range: "$.get('date_range', 'recent')",
          custom_params: "$.get('custom_params', {})"
        },
        outputs: {
          content: "$.get('content')",
          metadata: "$.get('metadata')",
          "workflow-status": "$.get('content') is not None and 'executed' or 'skipped'"
        },
        tasks: generateWorkflowTasks(workflowName.replace('workflow-', 'prompt-'), hasDataConnector, hasImageGeneration, hasWebSearch, useCase, sport)
      }
    };
    
    return yaml.dump(workflow, { indent: 2 });
  }

  // Helper function to generate workflow tasks
  function generateWorkflowTasks(promptName: string, hasDataConnector: boolean, hasImageGeneration: boolean, hasWebSearch: boolean, useCase: string, sport: string): any[] {
    const tasks = [];
    
    // Task 1: Load/fetch data if data connector is available
    if (hasDataConnector) {
      tasks.push({
        type: "document",
        name: "load-sports-data",
        description: `Load ${sport} data from external source`,
        condition: "$.get('event_code') is not None or $.get('entity_name') != ''",
        config: {
          action: "search",
          "search-limit": 10,
          "search-vector": false
        },
        filters: {
          ...(useCase.includes('event') && { "value.sport_event.id": "$.get('event_code')" }),
          ...(useCase.includes('team') && { "value.team.name": "$.get('entity_name')" }),
          ...(useCase.includes('player') && { "value.player.name": "$.get('entity_name')" })
        },
        inputs: {
          name: `'${sport}-data'`
        },
        outputs: {
          "sports-data": "$.get('documents', [])",
          "data-available": "len($.get('documents', [])) > 0"
        }
      });
    }
    
    // Task 2: Web search if needed
    if (hasWebSearch) {
      tasks.push({
        type: "connector",
        name: "web-search",
        description: "Search for additional context and recent information",
        condition: hasDataConnector ? "$.get('data-available') is True" : "True",
        connector: {
          name: "perplexity",
          command: "search"
        },
        inputs: {
          query: `"${sport} ${useCase} " + $.get('entity_name', '') + " recent news"`
        },
        outputs: {
          "web-results": "$",
          "additional-context": "$.get('results', [])"
        }
      });
    }
    
    // Task 3: Main content generation
    tasks.push({
      type: "prompt",
      name: "generate-content",
      description: `Generate ${useCase} content using AI`,
      condition: hasDataConnector ? "$.get('data-available') is True" : "True",
      connector: {
        name: "openai",
        command: "invoke_prompt",
        model: "gpt-4o"
      },
      inputs: {
        ...(hasDataConnector && { "sports_data": "$.get('sports-data', [])" }),
        ...(hasWebSearch && { "web_context": "$.get('additional-context', [])" }),
        entity_name: "$.get('entity_name', '')",
        date_range: "$.get('date_range', 'recent')",
        custom_params: "$.get('custom_params', {})"
      },
      outputs: {
        content: "$",
        metadata: "$.get('metadata', {})"
      }
    });
    
    // Task 4: Image generation if needed
    if (hasImageGeneration) {
      tasks.push({
        type: "connector",
        name: "generate-image",
        description: "Generate accompanying image",
        condition: "$.get('content') is not None",
        connector: {
          name: "stability",
          command: "generate_image"
        },
        inputs: {
          prompt: `"${sport} ${useCase} image featuring " + $.get('entity_name', '') + " in action"`
        },
        outputs: {
          "image-url": "$.get('image_url')",
          "image-metadata": "$.get('metadata', {})"
        }
      });
    }
    
    // Task 5: Store results
    tasks.push({
      type: "document",
      name: "store-results",
      description: "Store the generated content",
      condition: "$.get('content') is not None",
      config: {
        action: "create",
        "embed-vector": true,
        "force-update": false
      },
      documents: {
        [`content-${useCase}`]: {
          content: "$.get('content')",
          metadata: {
            sport: sport,
            use_case: useCase,
            entity_name: "$.get('entity_name', '')",
            generated_at: "datetime.utcnow().isoformat()",
            ...(hasImageGeneration && { image_url: "$.get('image-url')" })
          },
          status: "active"
        }
      },
      metadata: {
        document_type: `'content-${useCase}'`,
        sport: `'${sport}'`,
        entity: "$.get('entity_name', '')"
      }
    });
    
    return tasks;
  }

  // Helper function to generate prompt YAML
  function generatePromptYaml(promptName: string, description: string, sport: string, useCase: string, language: string, outputFormat: string, includeExamples: boolean): string {
    const languageMap = {
      'en': 'English',
      'es': 'Spanish',
      'pt-br': 'Brazilian Portuguese'
    };
    
    const langFull = languageMap[language as keyof typeof languageMap] || 'English';
    const langCode = language === 'pt-br' ? 'Portuguese' : language === 'es' ? 'Spanish' : 'English';
    
    const schema = generatePromptSchema(useCase, outputFormat, langCode);
    
    const prompt = {
      prompts: [
        {
          type: "prompt",
          title: `${sport.charAt(0).toUpperCase() + sport.slice(1)} ${useCase.charAt(0).toUpperCase() + useCase.slice(1)} Generator`,
          name: promptName,
          description: `${description} in ${langFull}`,
          schema
        }
      ]
    };
    
    return yaml.dump(prompt, { indent: 2 });
  }

  // Helper function to generate prompt schema based on use case
  function generatePromptSchema(useCase: string, outputFormat: string, language: string): any {
    const baseSchema = {
      title: `${useCase.charAt(0).toUpperCase() + useCase.slice(1)}Content`,
      description: `Schema for generating ${useCase} content in ${language}`,
      type: "object",
      properties: {}
    };
    
    // Common properties for all use cases
    baseSchema.properties = {
      title: {
        type: "string",
        description: `Generate an engaging and compelling title in ${language} that captures the essence of the ${useCase}. Make it attention-grabbing and click-worthy.`
      }
    };
    
    // Use case specific properties
    if (useCase.includes('recap')) {
      baseSchema.properties = {
        ...baseSchema.properties,
        subtitle: {
          type: "string",
          description: `Create a brief informative subtitle in ${language} that expands on the title and provides more context.`
        },
        slug: {
          type: "string",
          description: `Create a unique SEO-friendly slug for the content, using hyphens and compatible with URLs.`
        },
        content: {
          type: "string",
          description: `Write detailed ${useCase} content in ${language}. Include key moments, performance analysis, and engaging narrative. ${outputFormat === 'html' ? 'Wrap content in appropriate HTML tags.' : ''}`
        },
        summary: {
          type: "string",
          description: `Provide a concise summary of the main points in ${language}.`
        }
      };
    } else if (useCase.includes('quiz')) {
      baseSchema.properties = {
        ...baseSchema.properties,
        questions: {
          type: "array",
          description: `Generate quiz questions in ${language}`,
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The quiz question" },
              options: { type: "array", items: { type: "string" }, description: "Multiple choice options" },
              correct_answer: { type: "string", description: "The correct answer" },
              explanation: { type: "string", description: "Explanation for the correct answer" }
            }
          }
        }
      };
    } else if (useCase.includes('poll')) {
      baseSchema.properties = {
        ...baseSchema.properties,
        poll_question: {
          type: "string",
          description: `Generate an engaging poll question in ${language}`
        },
        options: {
          type: "array",
          description: "Poll options for users to choose from",
          items: { type: "string" }
        }
      };
    } else if (useCase.includes('prediction')) {
      baseSchema.properties = {
        ...baseSchema.properties,
        prediction: {
          type: "string",
          description: `Generate a detailed prediction analysis in ${language}`
        },
        confidence_level: {
          type: "string",
          description: "Confidence level for the prediction (high/medium/low)"
        },
        key_factors: {
          type: "array",
          description: "Key factors influencing the prediction",
          items: { type: "string" }
        }
      };
    } else {
      // Generic content structure
      baseSchema.properties = {
        ...baseSchema.properties,
        content: {
          type: "string",
          description: `Generate engaging ${useCase} content in ${language}. Make it informative, well-structured, and engaging for the target audience.`
        }
      };
    }
    
    return baseSchema;
  }

  // Helper function to generate install YAML
  function generateInstallYaml(promptName: string, workflowName: string): string {
    const install = {
      datasets: [
        {
          type: "prompts",
          path: `${promptName}.yml`
        },
        {
          type: "workflow", 
          path: `${workflowName}.yml`
        }
      ]
    };
    
    return yaml.dump(install, { indent: 2 });
  }

  // Helper function to generate comprehensive documentation
  function generateDocumentation(name: string, description: string, sport: string, useCase: string, language: string, connectors: string[], outputFormat: string): string {
    const langMap = { 'en': 'English', 'es': 'Spanish', 'pt-br': 'Brazilian Portuguese' };
    const fullLanguage = langMap[language as keyof typeof langMap] || 'English';
    
    return `
## Overview

**${name}** is a Machina Sports AI agent designed to ${description.toLowerCase()}. This agent specializes in ${sport} and focuses on generating ${useCase} content in ${fullLanguage}.

## Features

- **Sport Focus**: ${sport.charAt(0).toUpperCase() + sport.slice(1)}
- **Use Case**: ${useCase.charAt(0).toUpperCase() + useCase.slice(1)} generation
- **Language**: ${fullLanguage}
- **Output Format**: ${outputFormat.toUpperCase()}
- **Data Integration**: ${connectors.length} connector(s) integrated

## Required Connectors

${connectors.map(connector => `- **${connector}**: ${getConnectorDescription(connector)}`).join('\n')}

## Environment Variables

Make sure to configure the following environment variables in your Machina instance:

- \`MACHINA_CONTEXT_VARIABLE_OPENAI_API_KEY\`: OpenAI API key for AI generation
${connectors.includes('sportradar-soccer') || connectors.includes('sportradar-nba') || connectors.includes('sportradar-nfl') ? '- `MACHINA_CONTEXT_VARIABLE_SPORTRADAR_API_KEY`: SportRadar API key for sports data' : ''}
${connectors.includes('stability') ? '- `MACHINA_CONTEXT_VARIABLE_STABILITY_API_KEY`: Stability AI API key for image generation' : ''}
${connectors.includes('perplexity') ? '- `MACHINA_CONTEXT_VARIABLE_PERPLEXITY_API_KEY`: Perplexity API key for web search' : ''}

## Input Parameters

- **event_code**: Specific event/match identifier (optional)
- **entity_name**: Team or player name to focus on
- **date_range**: Time period to analyze (default: 'recent')
- **custom_params**: Additional parameters as JSON object

## Usage Examples

### Basic Usage
\`\`\`json
{
  "entity_name": "Manchester United",
  "date_range": "last_match"
}
\`\`\`

### With Event Code
\`\`\`json
{
  "event_code": "sr:match:12345",
  "entity_name": "Barcelona"
}
\`\`\`

### With Custom Parameters
\`\`\`json
{
  "entity_name": "Lakers",
  "date_range": "last_5_games",
  "custom_params": {
    "include_statistics": true,
    "analysis_depth": "comprehensive"
  }
}
\`\`\`
`;
  }

  // Helper function to get connector descriptions
  function getConnectorDescription(connectorName: string): string {
    const descriptions: { [key: string]: string } = {
      'openai': 'AI content generation and natural language processing',
      'sportradar-soccer': 'Real-time soccer match data, statistics, and event information',
      'sportradar-nba': 'NBA game data, player statistics, and team performance metrics',
      'sportradar-nfl': 'NFL game information, player stats, and league data',
      'sportradar-mlb': 'MLB baseball statistics and game information',
      'sportradar-rugby': 'Rugby match data and player statistics',
      'fastf1': 'Formula 1 race data, lap times, and driver statistics',
      'stability': 'AI image generation for visual content',
      'perplexity': 'Web search and real-time information retrieval',
      'tallysight': 'Sports betting odds and prediction data',
      'groq': 'Fast AI inference for real-time content generation',
      'elevenlabs': 'Text-to-speech and voice generation',
      'machina-ai': 'Machina\'s proprietary AI services'
    };
    
    return descriptions[connectorName] || 'Sports data and AI integration';
  }

  // Prompt that guides a user through creating a new agent template
  server.prompt(
    "agent-creation-wizard",
    "Step-by-step wizard for building a custom Machina agent template",
    {},
    async (): Promise<GetPromptResult> => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are an interactive assistant that helps users create a new Machina agent template.\n\n` +
                    `Guide the user through the following questions one at a time and wait for their answer after each:\n` +
                    `1. Name of the agent template.\n` +
                    `2. Short description of what the agent does.\n` +
                    `3. Sport focus (e.g., soccer, nba, nfl).\n` +
                    `4. Primary use case (e.g., recap, quiz, poll).\n` +
                    `5. Preferred language (en, es, pt-br).\n` +
                    `6. Required data sources or connectors (comma-separated). If you're unsure what connectors exist, ask me to list them and I'll fetch suggestions.\n` +
                    `7. Desired output format (text, json, markdown, html).\n` +
                    `8. Include example prompts? (yes or no).\n\n` +
                    `After collecting all answers, confirm the details with the user then call the \"generate-agent-template\" tool using the gathered parameters.\n` +
                    `Return the generated YAML template and offer further customization if needed.`
            }
          }
        ]
      };
    }
  );

  // Add a prompt template for common data analysis task: Game Recap Analysis
  server.prompt(
    "game-recap-analysis",
    "Analyzes a sports game and generates a detailed recap",
    {
      sport: z.string().describe("The sport type (e.g., 'soccer', 'nba', 'nfl')"),
      home_team: z.string().describe("Name of the home team"),
      away_team: z.string().describe("Name of the away team"),
      date: z.string().describe("Date of the game (YYYY-MM-DD)"),
      home_score: z.string().describe("Score of the home team"),
      away_score: z.string().describe("Score of the away team"),
      key_events: z.string().describe("Key events during the game as a comma-separated list").optional(),
      language: z.string().describe("Language for the recap (en, es, pt-br)").optional(),
      style: z.string().describe("Style of the recap (neutral, home_fan, away_fan)").optional(),
    },
    async ({ sport, home_team, away_team, date, home_score, away_score, key_events, language, style }): Promise<GetPromptResult> => {
      // Format key events
      const eventsArray = key_events ? key_events.split(",").map(e => e.trim()) : [];
      const events = eventsArray.length > 0 ? eventsArray.join("\n- ") : "No specific key events provided.";
      
      // Convert scores to numbers for comparison, with defaults if undefined
      const homeScoreNum = home_score ? parseInt(home_score, 10) : 0;
      const awayScoreNum = away_score ? parseInt(away_score, 10) : 0;
      const winner = homeScoreNum > awayScoreNum ? home_team : awayScoreNum > homeScoreNum ? away_team : "Neither team (it was a draw)";
      
      let styleGuidance = "Maintain a neutral, journalistic tone throughout the recap.";
      if (style === "home_fan") {
        styleGuidance = `Write from the perspective of a ${home_team} fan, with more enthusiasm for ${home_team}'s achievements.`;
      } else if (style === "away_fan") {
        styleGuidance = `Write from the perspective of an ${away_team} fan, with more enthusiasm for ${away_team}'s achievements.`;
      }
      
      const lang = language || "en";
      const languagePrompt = lang === "en" ? "in English" : lang === "es" ? "in Spanish" : "in Brazilian Portuguese";
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a professional sports writer specializing in ${sport}. Write engaging and accurate game recaps based on provided information.
              
Create a detailed game recap ${languagePrompt} for the ${sport} game between ${home_team} (home) and ${away_team} (away) played on ${date}.

Game result: ${home_team} ${home_score} - ${away_score} ${away_team}
Winner: ${winner}

Key events:
- ${events}

${styleGuidance}

Include the following in your recap:
1. An attention-grabbing headline
2. A compelling introduction summarizing the game outcome
3. Analysis of key moments and turning points
4. Brief mention of standout players
5. Concluding thoughts and what this result means for both teams going forward

Keep your recap informative, engaging and suitable for sports fans.`,
            },
          },
        ],
      };
    }
  );

  // Add a prompt template for common data analysis task: Player Performance Analysis
  server.prompt(
    "player-performance-analysis",
    "Analyzes a player's performance and generates insights",
    {
      sport: z.string().describe("The sport type (e.g., 'soccer', 'nba', 'nfl')"),
      player_name: z.string().describe("Name of the player to analyze"),
      team: z.string().describe("Player's team"),
      date_range: z.string().describe("Date range for analysis (e.g., '2023-01-01 to 2023-01-31')"),
      statistics: z.string().describe("Key statistics as JSON string, e.g., '{\"points\":24,\"rebounds\":10}'"),
      comparison: z.string().describe("Comparison to averages as JSON string (optional)").optional(),
      analysis_depth: z.string().describe("Depth of analysis (basic, detailed, comprehensive)").optional(),
      format: z.string().describe("Format of the analysis (text, bullet_points, structured_report)").optional(),
    },
    async ({ sport, player_name, team, date_range, statistics, comparison, analysis_depth, format }): Promise<GetPromptResult> => {
      // Parse statistics from JSON string
      let statsObj: Record<string, number> = {};
      let comparisonObj: Record<string, number> = {};
      
      try {
        statsObj = JSON.parse(statistics);
      } catch (e) {
        statsObj = { "error": 0 };
        console.error("Failed to parse statistics JSON:", e);
      }
      
      if (comparison) {
        try {
          comparisonObj = JSON.parse(comparison);
        } catch (e) {
          console.error("Failed to parse comparison JSON:", e);
        }
      }
      
      // Format statistics for the prompt
      const statsDisplay = Object.entries(statsObj)
        .map(([key, value]) => 
          `- ${key}: ${value}${comparisonObj[key] ? ` (${comparisonObj[key] > 0 ? '+' : ''}${comparisonObj[key]}% vs avg)` : ''}`)
        .join('\n');
      
      let formatInstructions = "Write your analysis as a cohesive narrative text.";
      if (format === "bullet_points") {
        formatInstructions = "Format your analysis as bullet points with clear sections.";
      } else if (format === "structured_report") {
        formatInstructions = "Structure your analysis as a formal report with sections for Summary, Methodology, Findings, and Recommendations.";
      }
      
      let depthInstructions = "Provide a detailed analysis with meaningful insights on strengths, weaknesses, and notable patterns.";
      if (analysis_depth === "basic") {
        depthInstructions = "Provide a basic overview of the player's performance.";
      } else if (analysis_depth === "comprehensive") {
        depthInstructions = "Deliver a comprehensive, in-depth analysis with detailed statistical breakdown, historical context, and nuanced interpretation of the player's performance.";
      }
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a professional sports analyst specializing in ${sport}. Your task is to analyze player performance data and provide insightful, data-driven analysis.
              
Analyze the performance of ${player_name} from ${team} during the period ${date_range}.

Player statistics:
${statsDisplay}

${depthInstructions}
${formatInstructions}

Your analysis should include:
1. An assessment of overall performance
2. Identification of strengths and weaknesses
3. Comparison to expectations and historical performance
4. Context within team dynamics
5. Actionable insights or recommendations

Make your analysis valuable for coaches, fans, and sports analysts.`,
            },
          },
        ],
      };
    }
  );

  // Add a prompt template for common data analysis task: Team Trend Analysis
  server.prompt(
    "team-trend-analysis",
    "Analyzes team performance trends over time",
    {
      sport: z.string().describe("The sport type (e.g., 'soccer', 'nba', 'nfl')"),
      team_name: z.string().describe("Name of the team to analyze"),
      period: z.string().describe("Time period for analysis (e.g., 'Last 10 games', '2023 season')"),
      results_json: z.string().describe("Recent game results as JSON string array"),
      metrics_json: z.string().describe("Key metrics as JSON string (optional)").optional(),
      focus_areas: z.string().describe("Specific areas to focus on, comma-separated").optional(),
      language: z.string().describe("Language for analysis (en, es, pt-br)").optional(),
    },
    async ({ sport, team_name, period, results_json, metrics_json, focus_areas, language }): Promise<GetPromptResult> => {
      // Parse results from JSON string
      let results: Array<{date: string, opponent: string, result: string, score: string}> = [];
      let metrics: Record<string, number[]> = {};
      
      try {
        results = JSON.parse(results_json);
      } catch (e) {
        console.error("Failed to parse results JSON:", e);
        results = [{ date: "unknown", opponent: "unknown", result: "unknown", score: "unknown" }];
      }
      
      if (metrics_json) {
        try {
          metrics = JSON.parse(metrics_json);
        } catch (e) {
          console.error("Failed to parse metrics JSON:", e);
        }
      }
      
      // Format results and metrics
      const resultsDisplay = results.map(game => 
        `- ${game.date}: ${team_name} vs ${game.opponent} - ${game.result} (${game.score})`
      ).join('\n');
      
      let metricsDisplay = "";
      if (Object.keys(metrics).length > 0) {
        metricsDisplay = "Performance metrics over time:\n" + 
          Object.entries(metrics)
            .map(([metric, values]) => `- ${metric}: ${values.join(', ')}`)
            .join('\n');
      }
      
      const focusAreasArray = focus_areas ? focus_areas.split(',').map(area => area.trim()) : [];
      const focusAreasDisplay = focusAreasArray.length > 0 
        ? `\nFocus on these specific areas in your analysis:\n${focusAreasArray.map(area => `- ${area}`).join('\n')}`
        : "";
      
      const lang = language || "en";
      const languagePrompt = lang === "en" ? "in English" : lang === "es" ? "in Spanish" : "in Brazilian Portuguese";
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a professional sports analyst specializing in ${sport}. Your expertise is identifying patterns and trends in team performance over time.
              
Analyze the performance trends of ${team_name} during ${period} ${languagePrompt}.

Recent results:
${resultsDisplay}

${metricsDisplay}
${focusAreasDisplay}

Provide a comprehensive trend analysis that includes:
1. Overall performance trajectory (improving, declining, or stable)
2. Patterns in wins and losses
3. Statistical trends and what they reveal
4. Changes in team strategy or style of play
5. Factors potentially influencing performance changes
6. Predictions for future performance based on identified trends

Your analysis should be insightful, backed by the data provided, and valuable for coaches, management, and fans.`,
            },
          },
        ],
      };
    }
  );

  // Add a prompt template for fan engagement content creation
  server.prompt(
    "fan-engagement-content",
    "Creates engaging fan content for sports events",
    {
      sport: z.string().describe("The sport type (e.g., 'soccer', 'nba', 'nfl')"),
      team: z.string().describe("Primary team to focus on"),
      event_type: z.string().describe("Type of event (e.g., 'matchday', 'draft', 'season-preview')"),
      content_format: z.string().describe("Content format (e.g., 'quiz', 'poll', 'prediction', 'newsletter')"),
      stats_json: z.string().describe("Recent statistics as JSON string (optional)").optional(),
      tone: z.string().describe("Content tone (e.g., 'casual', 'analytical', 'enthusiastic')").optional(),
      target_audience: z.string().describe("Target audience (e.g., 'hardcore-fans', 'casual-viewers', 'new-fans')").optional(),
    },
    async ({ sport, team, event_type, content_format, stats_json, tone, target_audience }): Promise<GetPromptResult> => {
      // Parse stats if provided
      let stats: Record<string, any> = {};
      
      if (stats_json) {
        try {
          stats = JSON.parse(stats_json);
        } catch (e) {
          console.error("Failed to parse stats JSON:", e);
        }
      }
      
      // Set defaults for optional parameters
      const contentTone = tone || "enthusiastic";
      const audience = target_audience || "hardcore-fans";
      const format = content_format || "general";
      
      // Match content format to available templates
      let templateReference = "";
      let connectorReference = "";
      
      // Match content format to actual templates
      if (format === "quiz" || format.includes("quiz")) {
        templateReference = "Use the reporter-quizzes-en template for structured quiz creation";
        connectorReference = "Consider using the sportradar connectors for accurate sports data";
      } else if (format === "poll" || format.includes("poll")) {
        templateReference = "Follow the reporter-polls-en template structure for compelling poll options";
        connectorReference = "The sportradar connectors can provide factual data for poll options";
      } else if (format === "recap" || format.includes("recap")) {
        templateReference = "The reporter-recap template offers a framework for post-game analysis";
        connectorReference = "Integrate with the appropriate sportradar connector based on the sport";
      } else if (format === "image" || format.includes("image")) {
        templateReference = "Utilize the reporter-image template for generating visual content";
        connectorReference = "The stability connector can be used for image generation"; 
      } else if (format === "newsletter" || format.includes("newsletter")) {
        templateReference = "The personalized-fan-newsletter template provides a structure for periodic updates";
        connectorReference = "Combine multiple connectors for a data-rich newsletter";
      } else if (format === "podcast" || format.includes("podcast")) {
        templateReference = "Base your script on the personalized-sports-podcast or nfl-podcast-generator templates";
        connectorReference = "The elevenlabs connector can assist with audio generation";
      } else if (format === "gameday" || format.includes("gameday")) {
        templateReference = "Use the gameday-fan-engagement or gameday-ai-companion templates";
        connectorReference = "Real-time data connectors like sportradar are essential for gameday content";
      } else if (format === "fantasy" || format.includes("fantasy")) {
        templateReference = "The fantasy-draft-assistant template offers structures for fantasy sports content";
        connectorReference = "Sport-specific connectors provide the statistics needed for fantasy analysis";
      } else {
        templateReference = "For general content, the chat-completion template can be adapted to your needs";
        connectorReference = "Choose a sport-specific connector like sportradar to incorporate relevant data";
      }
      
      // Audience adjustment tips
      let audienceTips = "";
      if (audience === "hardcore-fans") {
        audienceTips = "Use advanced statistics, detailed analysis, and sport-specific terminology";
      } else if (audience === "casual-viewers") {
        audienceTips = "Focus on storytelling, explain technical terms, and highlight interesting narratives";
      } else if (audience === "new-fans") {
        audienceTips = "Provide context about the sport, explain rules when relevant, and focus on excitement";
      } else {
        audienceTips = "Balance statistical insights with engaging storytelling";
      }
      
      // Create stats display if available
      let statsDisplay = "";
      if (Object.keys(stats).length > 0) {
        statsDisplay = "Recent statistics:\n" + 
          Object.entries(stats)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
      }
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a content creator for ${team}, a ${sport} team. You need to create engaging ${format} content for ${event_type} with a ${contentTone} tone.

Template Reference: ${templateReference}
Connector Reference: ${connectorReference}
Audience: ${audience} - ${audienceTips}

${statsDisplay ? statsDisplay + "\n\n" : ""}
Create compelling ${format} content that:
1. Engages fans and encourages interaction
2. Uses accurate and relevant data about ${team}
3. Fits the ${event_type} context appropriately
4. Maintains a ${contentTone} tone throughout
5. Includes appropriate calls to action

Your content should be immediately usable in a social media or fan engagement campaign.`,
            },
          },
        ],
      };
    }
  );

  // Add a prompt template for data-driven sport insights
  server.prompt(
    "sport-data-insights",
    "Generates insights from sports data using appropriate connectors",
    {
      sport: z.string().describe("The sport type (e.g., 'soccer', 'nba', 'nfl', 'f1')"),
      data_source: z.string().describe("Data source connector (e.g., 'sportradar-nba', 'fastf1', 'mlb-statsapi')"),
      analysis_type: z.string().describe("Type of analysis (e.g., 'player-comparison', 'team-trends', 'season-projection')"),
      time_period: z.string().describe("Time period to analyze (e.g., 'last-game', '10-games', 'season')"),
      entities_json: z.string().describe("Players/teams to analyze as JSON array").optional(),
      metrics: z.string().describe("Specific metrics to focus on (comma-separated)").optional(),
      output_format: z.string().describe("Output format (text, json, markdown, html)").default("text"),
    },
    async ({ sport, data_source, analysis_type, time_period, entities_json, metrics, output_format }): Promise<GetPromptResult> => {
      // Parse entities if provided
      let entities: string[] = [];
      
      if (entities_json) {
        try {
          entities = JSON.parse(entities_json);
        } catch (e) {
          console.error("Failed to parse entities JSON:", e);
          entities = [];
        }
      }
      
      // Determine connector-specific language
      let connectorContext = "";
      let analysisGuidance = "";
      
      // Default output format if not provided
      const format = output_format || "text";
      
      // Match data source to actual connectors
      if (data_source && data_source.includes("sportradar")) {
        const sportType = data_source.split('-')[1] || sport;
        connectorContext = `The ${data_source} connector provides comprehensive ${sportType?.toUpperCase()} data including player statistics, team performance, and game events.`;
        
        if (sportType === "nba") {
          analysisGuidance = "Consider both traditional stats (points, rebounds, assists) and advanced metrics (PER, true shooting percentage, etc.)";
        } else if (sportType === "nfl") {
          analysisGuidance = "For NFL analysis, focus on situational statistics, efficiency metrics, and contextual performance";
        } else if (sportType === "mlb") {
          analysisGuidance = "MLB analysis should consider sabermetrics like OPS, WAR, and ERA+ for deeper insights";
        } else if (sportType === "soccer") {
          analysisGuidance = "For soccer, consider possession metrics, expected goals (xG), and defensive contributions";
        }
      } else if (data_source && data_source.includes("fastf1")) {
        connectorContext = "The fastf1 connector provides Formula 1 racing data including lap times, tire strategies, and car telemetry.";
        analysisGuidance = "F1 analysis should consider factors like tire degradation, track position, and race strategy";
      } else if (data_source && data_source.includes("statsapi")) {
        connectorContext = "The mlb-statsapi connector offers detailed baseball statistics and play-by-play information.";
        analysisGuidance = "Consider traditional and advanced statistics to provide a comprehensive view of performance";
      } else if (data_source && data_source.includes("tallysight")) {
        connectorContext = "The tallysight connector provides sports predictions and betting insights across multiple sports.";
        analysisGuidance = "Focus on probability-based analysis and prediction accuracy metrics";
      } else {
        connectorContext = `The ${data_source || 'specified'} connector provides specialized data for ${sport} analysis.`;
        analysisGuidance = "Focus on the most relevant metrics for your specific analysis goals";
      }
      
      // Format metrics
      const metricsList = metrics ? metrics.split(',').map(m => m.trim()).join(', ') : "all relevant metrics";
      
      // Format entities
      const entitiesDisplay = entities.length > 0 
        ? `Entities to analyze: ${entities.join(', ')}`
        : "Analyze all relevant entities in the dataset";
      
      const outputGuidance = format === 'json' 
        ? "Provide a structured JSON response with clearly labeled metrics and insights."
        : format === 'markdown' 
        ? "Format your response with Markdown for headings, lists, and emphasis."
        : format === 'html'
        ? "Structure your response with appropriate HTML tags for web display."
        : "Provide a clear, well-organized text response.";
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a data analyst specializing in ${sport}. Generate insights using data from the ${data_source || 'specified'} connector.

${connectorContext}

Analysis parameters:
- Type: ${analysis_type}
- Time period: ${time_period}
- ${entitiesDisplay}
- Metrics: ${metricsList}

Analysis guidance:
${analysisGuidance}

Output instructions:
${outputGuidance}

Your analysis should:
1. Identify clear patterns and insights from the data
2. Provide context to make the insights meaningful
3. Use appropriate statistical terminology
4. Highlight unexpected or counterintuitive findings
5. Suggest actionable recommendations based on the data

Structure your analysis to be comprehensive yet accessible, with a clear flow from data observations to meaningful conclusions.`,
            },
          },
        ],
      };
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
              },
              generatorTool: {
                description: "Machina Agent Template Generator Tool",
                tool: "generate-agent-template",
                sports: ["soccer", "nba", "nfl", "rugby", "tennis", "golf", "f1"],
                useCases: ["recap", "preview", "prediction", "analysis", "quiz", "poll", "image", "summary", "social"],
                languages: ["en", "es", "pt-br"],
                outputFormats: ["text", "json", "markdown", "html"]
              },
              analysisPrompts: {
                description: "Analysis Prompt Templates",
                prompts: ["game-recap-analysis", "player-performance-analysis", "team-trend-analysis"]
              }
            }, null, 2),
          },
        ],
      };
    }
  );

  // Tool for analyzing agent requirements and suggesting optimizations
  server.tool(
    "analyze-agent-requirements",
    "Analyzes agent requirements and suggests optimal configurations, connectors, and workflows",
    {
      requirements: z.string().describe("Natural language description of the agent requirements"),
      target_audience: z.string().describe("Target audience (fans, analysts, developers, etc.)").optional(),
      performance_goals: z.string().describe("Performance goals (speed, accuracy, engagement, etc.)").optional(),
      existing_template: z.string().describe("Name of existing template to analyze or improve").optional(),
    },
    async ({ requirements, target_audience, performance_goals, existing_template }): Promise<CallToolResult> => {
      try {
        // Analyze the requirements using NLP patterns
        const analysis = analyzeAgentRequirements(requirements, target_audience, performance_goals);
        
        // Get existing template info if provided
        let templateAnalysis = "";
        if (existing_template) {
          templateAnalysis = analyzeExistingTemplate(existing_template);
        }
        
        // Generate recommendations
        const recommendations = generateAgentRecommendations(analysis, templateAnalysis);
        
        return {
          content: [
            {
              type: "text",
              text: `# Agent Requirements Analysis

## Requirement Analysis

${analysis.summary}

## Sport Detection
- **Primary Sport**: ${analysis.sport}
- **Confidence**: ${analysis.sportConfidence}%

## Use Case Classification
- **Primary Use Case**: ${analysis.useCase}
- **Secondary Use Cases**: ${analysis.secondaryUseCases.join(', ') || 'None'}

## Complexity Assessment
- **Complexity Level**: ${analysis.complexity}
- **Estimated Development Time**: ${analysis.estimatedTime}

## Recommended Architecture

### Connectors Needed
${analysis.connectors.map(c => `- **${c.name}**: ${c.purpose}`).join('\n')}

### Workflow Structure
${analysis.workflowSteps.map((step, i) => `${i + 1}. **${step.name}**: ${step.description}`).join('\n')}

### Performance Considerations
${analysis.performanceConsiderations.join('\n')}

${templateAnalysis ? `## Existing Template Analysis\n${templateAnalysis}\n` : ''}

## Recommendations

${recommendations.map(r => `### ${r.category}\n${r.suggestion}\n`).join('\n')}

## Next Steps

1. **Generate Base Template**: Use the \`generate-agent-template\` tool with these parameters:
   - Sport: ${analysis.sport}
   - Use Case: ${analysis.useCase}
   - Language: ${analysis.language}

2. **Install Required Connectors**: Ensure these connectors are available in your Machina instance

3. **Test and Iterate**: Deploy a basic version and gather feedback for improvements

4. **Optimize Performance**: Implement the performance recommendations based on your specific requirements`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error analyzing agent requirements:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing agent requirements: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool for validating agent configurations before deployment
  server.tool(
    "validate-agent-config",
    "Validates agent configuration for potential issues and deployment readiness",
    {
      workflow_yaml: z.string().describe("The workflow YAML configuration to validate"),
      prompt_yaml: z.string().describe("The prompt YAML configuration to validate").optional(),
      target_environment: z.string().describe("Target deployment environment (dev, staging, prod)").default("dev"),
    },
    async ({ workflow_yaml, prompt_yaml, target_environment }): Promise<CallToolResult> => {
      try {
        // Parse YAML configurations
        let workflowConfig: any;
        let promptConfig: any;
        
        try {
          workflowConfig = yaml.load(workflow_yaml);
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: `❌ **Workflow YAML Validation Failed**\n\nError parsing workflow YAML: ${e}\n\nPlease check your YAML syntax.`,
              },
            ],
          };
        }
        
        if (prompt_yaml) {
          try {
            promptConfig = yaml.load(prompt_yaml);
          } catch (e) {
            return {
              content: [
                {
                  type: "text",
                  text: `⚠️ **Prompt YAML Validation Warning**\n\nError parsing prompt YAML: ${e}\n\nWorkflow validation will continue...`,
                },
              ],
            };
          }
        }
        
        // Validate workflow structure
        const workflowValidation = validateWorkflowConfig(workflowConfig, target_environment);
        
        // Validate prompt structure if provided
        const promptValidation = promptConfig ? validatePromptConfig(promptConfig) : { issues: [], score: 100 };
        
        // Generate overall assessment
        const overallScore = Math.round((workflowValidation.score + promptValidation.score) / 2);
        const status = overallScore >= 80 ? "✅ Ready for Deployment" : 
                     overallScore >= 60 ? "⚠️ Needs Minor Improvements" : 
                     "❌ Requires Major Fixes";
        
        return {
          content: [
            {
              type: "text",
              text: `# Agent Configuration Validation

## Overall Assessment: ${status}
**Score**: ${overallScore}/100

## Workflow Validation
**Score**: ${workflowValidation.score}/100

### Issues Found
${workflowValidation.issues.length > 0 ? 
  workflowValidation.issues.map(issue => `- **${issue.severity}**: ${issue.message}`).join('\n') :
  '✅ No issues found in workflow configuration'}

### Recommendations
${workflowValidation.recommendations.length > 0 ?
  workflowValidation.recommendations.map(rec => `- ${rec}`).join('\n') :
  '✅ Workflow configuration follows best practices'}

${promptConfig ? `## Prompt Validation
**Score**: ${promptValidation.score}/100

### Issues Found
${promptValidation.issues.length > 0 ? 
  promptValidation.issues.map(issue => `- **${issue.severity}**: ${issue.message}`).join('\n') :
  '✅ No issues found in prompt configuration'}` : ''}

## Deployment Checklist

### Required Environment Variables
${extractRequiredEnvVars(workflowConfig).map(env => `- [ ] ${env}`).join('\n')}

### Required Connectors
${extractRequiredConnectors(workflowConfig).map(conn => `- [ ] ${conn}`).join('\n')}

### Performance Considerations
- Estimated tokens per execution: ${estimateTokenUsage(workflowConfig, promptConfig)}
- Estimated execution time: ${estimateExecutionTime(workflowConfig)}
- Recommended rate limits: ${getRecommendedRateLimits(workflowConfig, target_environment)}

## Next Steps

${overallScore >= 80 ? 
  '✅ Your agent is ready for deployment! Upload the configuration files to your Machina instance.' :
  '⚠️ Please address the issues above before deployment.'}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error validating agent config:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error validating agent configuration: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Helper functions for agent analysis
  function analyzeAgentRequirements(requirements: string, targetAudience?: string, performanceGoals?: string) {
    const req = requirements.toLowerCase();
    
    // Sport detection
    const sports = ['soccer', 'football', 'basketball', 'nba', 'nfl', 'baseball', 'mlb', 'tennis', 'golf', 'rugby', 'f1', 'formula 1'];
    let detectedSport = 'general';
    let sportConfidence = 0;
    
    for (const sport of sports) {
      if (req.includes(sport)) {
        detectedSport = sport === 'football' ? 'soccer' : sport === 'basketball' ? 'nba' : sport;
        sportConfidence = 90;
        break;
      }
    }
    
    // Use case detection
    const useCases = ['recap', 'summary', 'analysis', 'quiz', 'poll', 'prediction', 'preview', 'image', 'video', 'podcast'];
    let detectedUseCase = 'content';
    const secondaryUseCases: string[] = [];
    
    for (const useCase of useCases) {
      if (req.includes(useCase)) {
        if (detectedUseCase === 'content') {
          detectedUseCase = useCase;
        } else {
          secondaryUseCases.push(useCase);
        }
      }
    }
    
    // Complexity assessment
    const complexityIndicators = {
      simple: ['simple', 'basic', 'quick'],
      moderate: ['moderate', 'standard', 'regular'],
      complex: ['complex', 'advanced', 'comprehensive', 'real-time', 'multi-modal']
    };
    
    let complexity = 'moderate';
    for (const [level, indicators] of Object.entries(complexityIndicators)) {
      if (indicators.some(indicator => req.includes(indicator))) {
        complexity = level;
        break;
      }
    }
    
    // Determine required connectors
    const connectors = [
      { name: 'openai', purpose: 'AI content generation and natural language processing' }
    ];
    
    if (detectedSport !== 'general') {
      connectors.push({
        name: `sportradar-${detectedSport}`,
        purpose: `${detectedSport.toUpperCase()} data and statistics`
      });
    }
    
    if (req.includes('image') || req.includes('visual')) {
      connectors.push({ name: 'stability', purpose: 'AI image generation' });
    }
    
    if (req.includes('search') || req.includes('web') || req.includes('news')) {
      connectors.push({ name: 'perplexity', purpose: 'Web search and real-time information' });
    }
    
    if (req.includes('betting') || req.includes('prediction') || req.includes('odds')) {
      connectors.push({ name: 'tallysight', purpose: 'Sports betting data and predictions' });
    }
    
    // Workflow steps
    const workflowSteps = [
      { name: 'Data Collection', description: 'Gather relevant sports data and context' },
      { name: 'Content Generation', description: 'Generate AI-powered content based on requirements' },
      { name: 'Quality Assurance', description: 'Validate and refine generated content' },
      { name: 'Storage & Distribution', description: 'Store results and prepare for delivery' }
    ];
    
    // Performance considerations
    const performanceConsiderations = [
      `• Target audience: ${targetAudience || 'General sports fans'}`,
      `• Performance goals: ${performanceGoals || 'Standard response time and accuracy'}`,
      `• Estimated complexity: ${complexity} level implementation`
    ];
    
    return {
      summary: `Analysis of requirements for a ${detectedSport} ${detectedUseCase} agent with ${complexity} complexity.`,
      sport: detectedSport,
      sportConfidence,
      useCase: detectedUseCase,
      secondaryUseCases,
      complexity,
      estimatedTime: complexity === 'simple' ? '1-2 days' : complexity === 'moderate' ? '3-5 days' : '1-2 weeks',
      connectors,
      workflowSteps,
      performanceConsiderations,
      language: req.includes('spanish') || req.includes('español') ? 'es' : 
                req.includes('portuguese') || req.includes('português') ? 'pt-br' : 'en'
    };
  }
  
  function analyzeExistingTemplate(templateName: string): string {
    const knownTemplates: Record<string, string> = {
      'chat-completion': 'Generic chat interface with thread management',
      'reporter-recap': 'Post-game recap generation with SEO optimization',
      'reporter-quiz': 'Interactive quiz generation for fan engagement',
      'gameday-ai-companion': 'Real-time game companion with live updates',
      'fantasy-draft-assistant': 'Fantasy sports draft recommendations'
    };
    
    const templateType = Object.keys(knownTemplates).find(key => templateName.includes(key));
    
    if (templateType && knownTemplates[templateType]) {
      return `**Existing Template**: ${templateType}\n**Description**: ${knownTemplates[templateType]}\n**Recommendation**: This template provides a solid foundation for your requirements.`;
    }
    
    return `**Template**: ${templateName}\n**Status**: Custom template - please review configuration manually.`;
  }
  
  function generateAgentRecommendations(analysis: any, templateAnalysis: string) {
    const recommendations = [
      {
        category: "Architecture",
        suggestion: analysis.complexity === 'complex' ? 
          "Consider implementing microservices architecture with separate workflows for different functions." :
          "A single workflow architecture will be sufficient for your requirements."
      },
      {
        category: "Performance",
        suggestion: analysis.connectors.length > 3 ?
          "Implement caching strategies and consider async processing for better performance." :
          "Standard synchronous processing should meet your performance needs."
      },
      {
        category: "Scalability",
        suggestion: analysis.useCase.includes('real-time') ?
          "Implement rate limiting and consider using Groq for faster inference." :
          "Standard OpenAI integration will provide good performance for your use case."
      }
    ];
    
    if (analysis.sport !== 'general') {
      recommendations.push({
        category: "Data Integration",
        suggestion: `Focus on ${analysis.sport} specific data sources and consider implementing data validation for sports statistics.`
      });
    }
    
    return recommendations;
  }
  
  function validateWorkflowConfig(config: any, environment: string) {
    const issues: Array<{severity: string, message: string}> = [];
    const recommendations: string[] = [];
    let score = 100;
    
    // Check required fields
    if (!config.workflow) {
      issues.push({ severity: 'ERROR', message: 'Missing workflow configuration' });
      score -= 30;
    }
    
    if (!config.workflow?.name) {
      issues.push({ severity: 'ERROR', message: 'Workflow name is required' });
      score -= 10;
    }
    
    if (!config.workflow?.tasks || config.workflow.tasks.length === 0) {
      issues.push({ severity: 'ERROR', message: 'At least one task is required' });
      score -= 20;
    }
    
    // Check environment variables
    if (!config.workflow?.['context-variables']) {
      issues.push({ severity: 'WARNING', message: 'No context variables defined - you may need API keys' });
      score -= 5;
    }
    
    // Check task configurations
    if (config.workflow?.tasks) {
      config.workflow.tasks.forEach((task: any, index: number) => {
        if (!task.name) {
          issues.push({ severity: 'ERROR', message: `Task ${index + 1} missing name` });
          score -= 5;
        }
        
        if (!task.type) {
          issues.push({ severity: 'ERROR', message: `Task ${index + 1} missing type` });
          score -= 5;
        }
        
        if (task.type === 'connector' && !task.connector) {
          issues.push({ severity: 'ERROR', message: `Task ${task.name} requires connector configuration` });
          score -= 10;
        }
      });
    }
    
    // Environment-specific checks
    if (environment === 'prod') {
      if (!config.workflow?.description) {
        issues.push({ severity: 'WARNING', message: 'Production workflows should have descriptions' });
        score -= 5;
      }
      
      recommendations.push('Add comprehensive error handling for production deployment');
      recommendations.push('Implement monitoring and logging for production use');
    }
    
    return { issues, recommendations, score: Math.max(0, score) };
  }
  
  function validatePromptConfig(config: any) {
    const issues: Array<{severity: string, message: string}> = [];
    let score = 100;
    
    if (!config.prompts || config.prompts.length === 0) {
      issues.push({ severity: 'ERROR', message: 'No prompts defined' });
      score -= 30;
    }
    
    config.prompts?.forEach((prompt: any, index: number) => {
      if (!prompt.name) {
        issues.push({ severity: 'ERROR', message: `Prompt ${index + 1} missing name` });
        score -= 10;
      }
      
      if (!prompt.schema) {
        issues.push({ severity: 'WARNING', message: `Prompt ${prompt.name} missing schema` });
        score -= 5;
      }
    });
    
    return { issues, score: Math.max(0, score) };
  }
  
  function extractRequiredEnvVars(config: any): string[] {
    const envVars: string[] = [];
    const contextVars = config.workflow?.['context-variables'] || {};
    
    Object.keys(contextVars).forEach(key => {
      if (typeof contextVars[key] === 'object' && contextVars[key].api_key) {
        envVars.push(contextVars[key].api_key.replace('$', ''));
      }
    });
    
    return envVars;
  }
  
  function extractRequiredConnectors(config: any): string[] {
    const connectors = new Set<string>();
    
    config.workflow?.tasks?.forEach((task: any) => {
      if (task.connector?.name) {
        connectors.add(task.connector.name);
      }
    });
    
    return Array.from(connectors);
  }
  
  function estimateTokenUsage(workflowConfig: any, promptConfig?: any): string {
    const tasks = workflowConfig.workflow?.tasks || [];
    const promptTasks = tasks.filter((task: any) => task.type === 'prompt');
    
    const baseTokens = promptTasks.length * 500; // Estimated base tokens per prompt
    const complexityMultiplier = tasks.length > 5 ? 1.5 : 1.0;
    
    return `${Math.round(baseTokens * complexityMultiplier)} tokens`;
  }
  
  function estimateExecutionTime(config: any): string {
    const tasks = config.workflow?.tasks || [];
    const connectorTasks = tasks.filter((task: any) => task.type === 'connector').length;
    const promptTasks = tasks.filter((task: any) => task.type === 'prompt').length;
    
    const estimatedSeconds = (connectorTasks * 2) + (promptTasks * 5);
    return `${estimatedSeconds}-${estimatedSeconds * 2} seconds`;
  }
  
  function getRecommendedRateLimits(config: any, environment: string): string {
    const taskCount = config.workflow?.tasks?.length || 0;
    
    if (environment === 'prod') {
      return taskCount > 5 ? '10 requests/minute' : '30 requests/minute';
    } else {
      return taskCount > 5 ? '5 requests/minute' : '15 requests/minute';
    }
  }

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

  // Comprehensive tool for end-to-end agent creation
  server.tool(
    "create-complete-agent",
    "Creates a complete Machina agent from natural language requirements - analyzes, generates, and validates the entire solution",
    {
      requirements: z.string().describe("Natural language description of what the agent should do"),
      agent_name: z.string().describe("Name for the agent (will be sanitized for file names)").optional(),
      target_audience: z.string().describe("Target audience for the agent").optional(),
      performance_goals: z.string().describe("Performance and quality goals").optional(),
      custom_features: z.string().describe("Any specific custom features or requirements").optional(),
    },
    async ({ requirements, agent_name, target_audience, performance_goals, custom_features }): Promise<CallToolResult> => {
      try {
        // Step 1: Analyze requirements
        const analysis = analyzeAgentRequirements(requirements, target_audience, performance_goals);
        
        // Step 2: Determine agent name
        const finalAgentName = agent_name || `${analysis.sport}-${analysis.useCase}-agent`;
        const sanitizedName = finalAgentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        // Step 3: Incorporate custom features
        const enhancedAnalysis = incorporateCustomFeatures(analysis, custom_features);
        
        // Step 4: Generate connectors list
        const connectors = determineConnectors(enhancedAnalysis.sport, enhancedAnalysis.useCase, []);
        
        // Step 5: Generate all required files
        const workflowName = `workflow-${sanitizedName}`;
        const promptName = `prompt-${sanitizedName}`;
        
        const workflowYaml = generateWorkflowYaml(workflowName, sanitizedName, enhancedAnalysis.description, enhancedAnalysis.sport, enhancedAnalysis.useCase, enhancedAnalysis.language, connectors, 'text');
        const promptYaml = generatePromptYaml(promptName, enhancedAnalysis.description, enhancedAnalysis.sport, enhancedAnalysis.useCase, enhancedAnalysis.language, 'text', true);
        const installYaml = generateInstallYaml(promptName, workflowName);
        
        // Step 6: Validate the generated configuration
        let workflowConfig: any;
        try {
          workflowConfig = yaml.load(workflowYaml);
        } catch (e) {
          throw new Error(`Generated workflow YAML is invalid: ${e}`);
        }
        
        const validation = validateWorkflowConfig(workflowConfig, 'dev');
        
        // Step 7: Generate deployment guide
        const deploymentGuide = generateDeploymentGuide(sanitizedName, connectors, enhancedAnalysis);
        
        // Step 8: Generate testing scenarios
        const testingScenarios = generateTestingScenarios(enhancedAnalysis);
        
        return {
          content: [
            {
              type: "text",
              text: `# Complete Machina Agent Solution: ${finalAgentName}

## 🎯 Agent Overview

**Description**: ${enhancedAnalysis.description}
**Sport Focus**: ${enhancedAnalysis.sport}
**Use Case**: ${enhancedAnalysis.useCase}
**Language**: ${enhancedAnalysis.language}
**Complexity**: ${enhancedAnalysis.complexity}

## 📊 Requirements Analysis

${enhancedAnalysis.summary}

### Key Features
${enhancedAnalysis.features ? enhancedAnalysis.features.map((f: string) => `- ${f}`).join('\n') : '- Standard agent functionality based on use case'}

### Connectors Required
${connectors.map(connector => `- **${connector}**: ${getConnectorDescription(connector)}`).join('\n')}

## 📁 Generated Files

### 1. _install.yml
\`\`\`yaml
${installYaml}
\`\`\`

### 2. ${workflowName}.yml
\`\`\`yaml
${workflowYaml}
\`\`\`

### 3. ${promptName}.yml
\`\`\`yaml
${promptYaml}
\`\`\`

## ✅ Configuration Validation

**Validation Score**: ${validation.score}/100

${validation.issues.length > 0 ? `### Issues Found
${validation.issues.map(issue => `- **${issue.severity}**: ${issue.message}`).join('\n')}` : '✅ No configuration issues found'}

${validation.recommendations.length > 0 ? `### Recommendations
${validation.recommendations.map(rec => `- ${rec}`).join('\n')}` : ''}

## 🚀 Deployment Guide

${deploymentGuide}

## 🧪 Testing Scenarios

${testingScenarios}

## 📈 Performance Estimates

- **Estimated execution time**: ${estimateExecutionTime(workflowConfig)}
- **Estimated token usage**: ${estimateTokenUsage(workflowConfig)}
- **Recommended rate limits**: ${getRecommendedRateLimits(workflowConfig, 'dev')}

## 🔧 Customization Options

### Easy Customizations
- Modify prompt instructions for different tone or style
- Adjust output format (text, JSON, HTML, Markdown)
- Add or remove specific data fields in the schema

### Advanced Customizations
- Add additional workflow tasks for data processing
- Integrate with more connectors for enhanced functionality
- Implement conditional logic for different scenarios
- Add error handling and retry mechanisms

## 🎯 Next Steps

1. **Create Directory**: \`mkdir agent-templates/${sanitizedName}\`
2. **Save Files**: Copy the three YAML files above into the directory
3. **Install Connectors**: Ensure required connectors are available
4. **Configure Environment**: Set up the required API keys
5. **Deploy**: Upload to your Machina Studio instance
6. **Test**: Run the testing scenarios to verify functionality
7. **Optimize**: Fine-tune based on real-world usage

Your complete agent solution is ready for deployment! 🎉`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating complete agent:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating complete agent: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Helper function to incorporate custom features
  function incorporateCustomFeatures(analysis: any, customFeatures?: string) {
    if (!customFeatures) return analysis;
    
    const features = customFeatures.toLowerCase();
    const enhancedAnalysis = { ...analysis };
    
    // Parse custom features and update analysis
    if (features.includes('real-time') || features.includes('live')) {
      enhancedAnalysis.complexity = 'complex';
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'Real-time data processing'];
    }
    
    if (features.includes('multi-language') || features.includes('multilingual')) {
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'Multi-language support'];
    }
    
    if (features.includes('social') || features.includes('twitter') || features.includes('instagram')) {
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'Social media integration'];
    }
    
    if (features.includes('email') || features.includes('newsletter')) {
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'Email/newsletter generation'];
    }
    
    if (features.includes('seo') || features.includes('search optimization')) {
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'SEO optimization'];
    }
    
    if (features.includes('analytics') || features.includes('tracking')) {
      enhancedAnalysis.features = [...(enhancedAnalysis.features || []), 'Analytics and tracking'];
    }
    
    // Update description to include custom features
    if (enhancedAnalysis.features && enhancedAnalysis.features.length > 0) {
      enhancedAnalysis.description = `${analysis.description} with enhanced features: ${enhancedAnalysis.features.join(', ')}`;
    }
    
    return enhancedAnalysis;
  }

  // Helper function to generate deployment guide
  function generateDeploymentGuide(agentName: string, connectors: string[], analysis: any): string {
    return `### Step-by-Step Deployment

1. **Prerequisites**
   - Machina Studio account with appropriate permissions
   - Required API keys for connectors
   - Basic knowledge of YAML configuration

2. **Environment Setup**
   \`\`\`bash
   # Create agent directory
   mkdir -p agent-templates/${agentName}
   cd agent-templates/${agentName}
   \`\`\`

3. **Configuration Files**
   - Save the three YAML files in the agent directory
   - Verify file naming matches the install.yml references

4. **Environment Variables**
   Configure these in your Machina Studio:
   \`\`\`
   MACHINA_CONTEXT_VARIABLE_OPENAI_API_KEY=your_openai_key
   ${connectors.includes('sportradar-soccer') || connectors.includes('sportradar-nba') || connectors.includes('sportradar-nfl') ? 'MACHINA_CONTEXT_VARIABLE_SPORTRADAR_API_KEY=your_sportradar_key' : ''}
   ${connectors.includes('stability') ? 'MACHINA_CONTEXT_VARIABLE_STABILITY_API_KEY=your_stability_key' : ''}
   ${connectors.includes('perplexity') ? 'MACHINA_CONTEXT_VARIABLE_PERPLEXITY_API_KEY=your_perplexity_key' : ''}
   \`\`\`

5. **Connector Installation**
   Ensure these connectors are installed in your Machina instance:
   ${connectors.map(conn => `   - ${conn}`).join('\n')}

6. **Upload and Deploy**
   - Upload the agent template to Machina Studio
   - Run initial tests in development environment
   - Monitor logs for any configuration issues

7. **Production Deployment**
   - Test thoroughly in staging environment
   - Configure appropriate rate limits
   - Set up monitoring and alerting
   - Deploy to production with gradual rollout`;
  }

  // Helper function to generate testing scenarios
  function generateTestingScenarios(analysis: any): string {
    const sport = analysis.sport;
    const useCase = analysis.useCase;
    
    return `### Basic Testing Scenarios

#### Scenario 1: Basic Functionality Test
\`\`\`json
{
  "entity_name": "${sport === 'soccer' ? 'Manchester United' : sport === 'nba' ? 'Lakers' : sport === 'nfl' ? 'Patriots' : 'Team Name'}",
  "date_range": "recent"
}
\`\`\`
**Expected**: Should generate ${useCase} content for the specified team

#### Scenario 2: Event-Specific Test
\`\`\`json
{
  "event_code": "sr:match:12345",
  "entity_name": "${sport === 'soccer' ? 'Barcelona' : sport === 'nba' ? 'Warriors' : sport === 'nfl' ? 'Cowboys' : 'Team Name'}"
}
\`\`\`
**Expected**: Should generate content for the specific event

#### Scenario 3: Custom Parameters Test
\`\`\`json
{
  "entity_name": "${sport === 'soccer' ? 'Real Madrid' : sport === 'nba' ? 'Celtics' : sport === 'nfl' ? 'Giants' : 'Team Name'}",
  "date_range": "last_5_games",
  "custom_params": {
    "include_statistics": true,
    "analysis_depth": "comprehensive"
  }
}
\`\`\`
**Expected**: Should generate detailed content with enhanced analysis

### Error Handling Tests

#### Test Empty Input
\`\`\`json
{}
\`\`\`
**Expected**: Should handle gracefully or provide appropriate error message

#### Test Invalid Event Code
\`\`\`json
{
  "event_code": "invalid_code",
  "entity_name": "Test Team"
}
\`\`\`
**Expected**: Should fallback to general team analysis

### Performance Tests

- Monitor execution time for each scenario
- Check token usage and costs
- Verify rate limiting behavior
- Test concurrent request handling`;
  }

  // Register a tool for connector inspection
  server.tool(
    "inspect-connector",
    "Inspects connector capabilities to understand available commands, schemas, and models",
    {
      connector_name: z
        .string()
        .describe("Name of the connector to inspect"),
      list_commands: z
        .boolean()
        .describe("List all available commands")
        .default(true),
      get_command_schema: z
        .string()
        .describe("Get schema for specific command")
        .optional(),
      list_models: z
        .boolean()
        .describe("List AI models for AI connectors")
        .default(false),
    },
    async ({ connector_name, list_commands, get_command_schema, list_models }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Inspecting connector: ${connector_name}...`,
          },
        });

        // Known models for different AI connectors
        const knownModels: Record<string, string[]> = {
          "openai": ["gpt-4o", "gpt-4", "gpt-3.5-turbo", "text-embedding-3-small", "text-embedding-3-large"],
          "groq": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
          "google-vertex": ["gemini-pro", "gemini-ultra", "text-bison"],
          "perplexity": ["sonar-small-online", "sonar-medium-online"],
          "stability": ["stable-diffusion-xl-1024-v1-0", "stable-diffusion-xl-beta-v2-2-2"]
        };

        // Connector information based on known connectors
        const connectorInfo = getConnectorInfo(connector_name);
        
        if (!connectorInfo) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Connector '${connector_name}' not found. Available connectors include: sportradar-soccer, sportradar-nba, sportradar-nfl, openai, groq, stability, perplexity, and others.`,
              },
            ],
          };
        }

        let result = `# Connector Inspection: ${connector_name}\n\n`;
        result += `**Type**: ${connectorInfo.type}\n`;
        result += `**Description**: ${connectorInfo.description}\n`;
        result += `**Requires API Key**: ${connectorInfo.requiresApiKey ? 'Yes' : 'No'}\n\n`;

        if (list_commands && connectorInfo.commands) {
          result += `## Available Commands\n\n`;
          connectorInfo.commands.forEach((cmd: any) => {
            result += `### ${cmd.name}\n`;
            result += `- **Description**: ${cmd.description}\n`;
            result += `- **Parameters**: ${cmd.parameters.join(', ')}\n\n`;
          });
        }

        if (get_command_schema && connectorInfo.commands) {
          const command = connectorInfo.commands.find((cmd: any) => cmd.name === get_command_schema);
          if (command) {
            result += `## Command Schema: ${get_command_schema}\n\n`;
            result += `**Schema**: ${JSON.stringify(command.schema, null, 2)}\n\n`;
          }
        }

        if (list_models && knownModels[connector_name]) {
          result += `## Available Models\n\n`;
          knownModels[connector_name].forEach(model => {
            result += `- ${model}\n`;
          });
          result += '\n';
        }

        if (connectorInfo.supportedSports) {
          result += `## Supported Sports\n\n`;
          connectorInfo.supportedSports.forEach((sport: string) => {
            result += `- ${sport}\n`;
          });
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error inspecting connector:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error inspecting connector: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for generating data mappings
  server.tool(
    "generate-mapping",
    "Auto-generates mappings between data structures using intelligent field matching",
    {
      source_schema: z
        .object({})
        .describe("Source data structure schema")
        .passthrough(),
      target_schema: z
        .object({})
        .describe("Target data structure schema")
        .passthrough(),
      mapping_name: z
        .string()
        .describe("Name for the generated mapping")
        .default("generated-mapping"),
      field_mappings: z
        .record(z.string())
        .describe("Explicit field mappings (target_field: source_field)")
        .default({}),
    },
    async ({ source_schema, target_schema, mapping_name, field_mappings }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Generating mapping: ${mapping_name}...`,
          },
        });

        // Analyze field compatibility
        const autoMappings = analyzeFieldCompatibility(source_schema, target_schema);
        const finalMappings = { ...autoMappings, ...field_mappings };

        // Generate mapping YAML structure
        const mappingConfig = {
          mapping: {
            name: mapping_name,
            title: `Auto-generated mapping for ${mapping_name}`,
            description: "Automatically generated mapping between data structures",
            fields: {} as Record<string, any>
          }
        };

        // Build field mappings with JSONPath expressions
        Object.entries(finalMappings).forEach(([targetField, sourceField]) => {
          mappingConfig.mapping.fields[targetField] = {
            path: `$.get('${sourceField}')`,
            type: inferFieldType(source_schema, sourceField),
            required: isFieldRequired(target_schema, targetField)
          };
        });

        // Generate transformations for common patterns
        mappingConfig.mapping.fields = {
          ...mappingConfig.mapping.fields,
          ...generateTransformations(source_schema, target_schema, finalMappings)
        };

        const unmappedFields = Object.keys((target_schema as any).properties || {})
          .filter(field => !finalMappings[field]);

        const yamlOutput = yaml.dump(mappingConfig, { indent: 2 });

        let result = `# Generated Mapping: ${mapping_name}\n\n`;
        result += `## Mapping Configuration\n\n\`\`\`yaml\n${yamlOutput}\n\`\`\`\n\n`;
        result += `## Mapping Summary\n\n`;
        result += `- **Mapped fields**: ${Object.keys(finalMappings).length}\n`;
        result += `- **Total target fields**: ${Object.keys((target_schema as any).properties || {}).length}\n`;
        
        if (unmappedFields.length > 0) {
          result += `- **Unmapped target fields**: ${unmappedFields.join(', ')}\n`;
        }

        result += `\n## Field Mappings\n\n`;
        Object.entries(finalMappings).forEach(([target, source]) => {
          result += `- **${target}** ← \`${source}\`\n`;
        });

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating mapping:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error generating mapping: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for generating prompt schemas
  server.tool(
    "generate-prompt-schema",
    "Generates optimal prompt schemas from requirements for different use cases",
    {
      use_case: z
        .string()
        .describe("What the prompt should accomplish (chat, content, summary, analysis, quiz, poll, image, prediction)")
        .default("general"),
      output_format: z
        .enum(["structured", "markdown", "json", "text"])
        .describe("Expected output format")
        .default("structured"),
      required_fields: z
        .array(z.string())
        .describe("Required fields in output")
        .default([]),
      model: z
        .string()
        .describe("Target AI model")
        .default("gpt-4o"),
    },
    async ({ use_case, output_format, required_fields, model }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Generating prompt schema for ${use_case}...`,
          },
        });

        // Get base schema for use case
        const baseSchema = getSchemaForUseCase(use_case);
        
        // Customize schema based on requirements
        let finalSchema = baseSchema;
        if (required_fields.length > 0) {
          finalSchema = enhanceSchemaWithFields(baseSchema, required_fields, output_format);
        }

        // Optimize for specific model
        finalSchema = optimizeSchemaForModel(finalSchema, model);

        // Generate complete prompt configuration
        const promptConfig = {
          prompts: [{
            type: "prompt",
            title: `${use_case.charAt(0).toUpperCase() + use_case.slice(1)} Prompt`,
            name: `${use_case.toLowerCase().replace(/\s+/g, '-')}-prompt`,
            description: `Optimized prompt for ${use_case}`,
            schema: finalSchema
          }]
        };

        const yamlOutput = yaml.dump(promptConfig, { indent: 2 });
        const estimatedTokens = estimateSchemaTokenUsage(finalSchema);

        let result = `# Generated Prompt Schema: ${use_case}\n\n`;
        result += `## Prompt Configuration\n\n\`\`\`yaml\n${yamlOutput}\n\`\`\`\n\n`;
        result += `## Schema Details\n\n`;
        result += `- **Use Case**: ${use_case}\n`;
        result += `- **Output Format**: ${output_format}\n`;
        result += `- **Target Model**: ${model}\n`;
        result += `- **Estimated Token Usage**: ~${estimatedTokens} tokens\n\n`;

        if (required_fields.length > 0) {
          result += `## Required Fields\n\n`;
          required_fields.forEach(field => {
            result += `- ${field}\n`;
          });
        }

        result += `\n## Schema Optimizations\n\n`;
        result += `- Optimized for ${model} capabilities\n`;
        result += `- Structured for ${output_format} output\n`;
        result += `- Includes field validation and constraints\n`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating prompt schema:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error generating prompt schema: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for workflow optimization
  server.tool(
    "optimize-workflow",
    "Optimizes workflow structure for performance, cost, or balanced goals",
    {
      workflow_yaml: z
        .string()
        .describe("Workflow YAML to optimize"),
      optimization_goal: z
        .enum(["speed", "cost", "balanced"])
        .describe("Optimization goal")
        .default("balanced"),
      merge_tasks: z
        .boolean()
        .describe("Merge compatible tasks")
        .default(true),
      parallelize: z
        .boolean()
        .describe("Identify parallelizable tasks")
        .default(true),
    },
    async ({ workflow_yaml, optimization_goal, merge_tasks, parallelize }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Optimizing workflow for ${optimization_goal}...`,
          },
        });

        let workflow;
        try {
          workflow = yaml.load(workflow_yaml) as any;
        } catch {
          return {
            content: [
              {
                type: "text",
                text: "Error: Invalid workflow YAML provided",
              },
            ],
          };
        }

        const optimizations: string[] = [];
        let optimizedWorkflow = JSON.parse(JSON.stringify(workflow));

        // 1. Remove redundant document searches
        if (merge_tasks) {
          const { workflow: mergedWorkflow, mergedCount } = mergeDocumentSearches(optimizedWorkflow);
          optimizedWorkflow = mergedWorkflow;
          if (mergedCount > 0) {
            optimizations.push(`Merged ${mergedCount} redundant document searches`);
          }
        }

        // 2. Optimize task ordering
        const { workflow: reorderedWorkflow, reordered } = optimizeTaskOrder(optimizedWorkflow);
        optimizedWorkflow = reorderedWorkflow;
        if (reordered) {
          optimizations.push("Reordered tasks for optimal data flow");
        }

        // 3. Identify parallelizable tasks
        if (parallelize) {
          const parallelGroups = identifyParallelTasks(optimizedWorkflow);
          if (parallelGroups.length > 0) {
            optimizedWorkflow = addParallelExecution(optimizedWorkflow, parallelGroups);
            optimizations.push(`Identified ${parallelGroups.length} parallel task groups`);
          }
        }

        // 4. Goal-specific optimizations
        if (optimization_goal === "speed") {
          optimizedWorkflow = optimizeForSpeed(optimizedWorkflow);
          optimizations.push("Optimized for minimum latency");
        } else if (optimization_goal === "cost") {
          optimizedWorkflow = optimizeForCost(optimizedWorkflow);
          optimizations.push("Optimized for minimum token usage");
        }

        // 5. Add intelligent caching
        optimizedWorkflow = addIntelligentCaching(optimizedWorkflow);
        optimizations.push("Added intelligent caching");

        const optimizedYaml = yaml.dump(optimizedWorkflow, { indent: 2 });
        const performanceEstimate = estimateWorkflowPerformance(optimizedWorkflow);
        const costEstimate = estimateWorkflowCost(optimizedWorkflow);

        let result = `# Workflow Optimization Results\n\n`;
        result += `## Optimized Workflow\n\n\`\`\`yaml\n${optimizedYaml}\n\`\`\`\n\n`;
        result += `## Applied Optimizations\n\n`;
        optimizations.forEach(opt => {
          result += `- ${opt}\n`;
        });
        result += `\n## Performance Estimates\n\n`;
        result += `- **Estimated Latency**: ${performanceEstimate.latency}ms\n`;
        result += `- **Estimated Cost**: $${costEstimate.cost}\n`;
        result += `- **Parallelizable Tasks**: ${performanceEstimate.parallelizable ? 'Yes' : 'No'}\n`;
        
        if (performanceEstimate.bottlenecks.length > 0) {
          result += `- **Bottlenecks**: ${performanceEstimate.bottlenecks.join(', ')}\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error optimizing workflow:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error optimizing workflow: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for resolving context variables
  server.tool(
    "resolve-context-variables",
    "Resolves all required context variables for an agent and generates proper environment configuration",
    {
      agent_config: z
        .object({})
        .describe("Agent configuration to analyze")
        .passthrough(),
      list_all_variables: z
        .boolean()
        .describe("List all required variables")
        .default(true),
      generate_defaults: z
        .boolean()
        .describe("Generate default values")
        .default(true),
      validate_references: z
        .boolean()
        .describe("Ensure all references exist")
        .default(true),
    },
    async ({ agent_config, list_all_variables, generate_defaults, validate_references }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: "Resolving context variables...",
          },
        });

        const requiredVariables = new Set<string>();
        const variableUsage: Record<string, string[]> = {};

        // Extract variables from workflows
        if (agent_config.workflows) {
          const workflows = Array.isArray(agent_config.workflows) ? agent_config.workflows : [];
          for (const workflow of workflows) {
            const workflowVars = extractWorkflowVariables(workflow);
            Object.keys(workflowVars).forEach(varCategory => {
              requiredVariables.add(varCategory);
              if (!variableUsage[varCategory]) {
                variableUsage[varCategory] = [];
              }
              variableUsage[varCategory].push(...workflowVars[varCategory]);
            });
          }
        }

        // Check agent context
        if (agent_config.context) {
          const contextVars = extractContextVariables(agent_config.context);
          contextVars.forEach(varCategory => requiredVariables.add(varCategory));
        }

        // Generate context variable configuration
        const contextConfig: any = {
          "context-variables": {}
        };

        // Process each required variable
        Array.from(requiredVariables).forEach(varCategory => {
          if (varCategory === "machina-ai") {
            contextConfig["context-variables"][varCategory] = {
              api_key: "$TEMP_CONTEXT_VARIABLE_SDK_OPENAI_API_KEY"
            };
          } else if (varCategory === "groq") {
            contextConfig["context-variables"][varCategory] = {
              api_key: "$TEMP_CONTEXT_VARIABLE_SDK_GROQ_API_KEY"
            };
          } else if (varCategory.startsWith("sportradar")) {
            contextConfig["context-variables"][varCategory] = {
              api_key: `$TEMP_CONTEXT_VARIABLE_SDK_${varCategory.toUpperCase().replace('-', '_')}_API_KEY`
            };
          } else if (generate_defaults) {
            contextConfig["context-variables"][varCategory] = generateDefaultVariables(varCategory);
          }
        });

        // Validate references
        const validationErrors: string[] = [];
        if (validate_references) {
          validationErrors.push(...validateVariableReferences(agent_config, contextConfig));
        }

        const environmentVariables = listEnvironmentVariables(contextConfig);
        const contextYaml = yaml.dump(contextConfig, { indent: 2 });

        let result = `# Context Variables Resolution\n\n`;
        result += `## Context Configuration\n\n\`\`\`yaml\n${contextYaml}\n\`\`\`\n\n`;
        result += `## Required Variables\n\n`;
        Array.from(requiredVariables).forEach(varCategory => {
          result += `- **${varCategory}**: Used in ${variableUsage[varCategory]?.length || 0} locations\n`;
        });

        result += `\n## Environment Variables\n\n`;
        environmentVariables.forEach(envVar => {
          result += `- \`${envVar}\`\n`;
        });

        if (validationErrors.length > 0) {
          result += `\n## Validation Errors\n\n`;
          validationErrors.forEach(error => {
            result += `- ❌ ${error}\n`;
          });
        } else {
          result += `\n✅ All variable references are valid\n`;
        }

        result += `\n## Variable Usage Summary\n\n`;
        Object.entries(variableUsage).forEach(([category, locations]) => {
          result += `- **${category}**: ${locations.join(', ')}\n`;
        });

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error resolving context variables:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error resolving context variables: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Register a tool for assembling complete agents
  server.tool(
    "assemble-complete-agent",
    "Assembles all components into a complete, deployable agent package",
    {
      base_config: z
        .object({})
        .describe("Base agent configuration")
        .passthrough(),
      workflows: z
        .array(z.object({}).passthrough())
        .describe("List of workflow configurations")
        .default([]),
      prompts: z
        .array(z.object({}).passthrough())
        .describe("List of prompt configurations")
        .default([]),
      mappings: z
        .array(z.object({}).passthrough())
        .describe("List of mapping configurations")
        .default([]),
      validate_completeness: z
        .boolean()
        .describe("Ensure all references are resolved")
        .default(true),
    },
    async ({ base_config, workflows, prompts, mappings, validate_completeness }, { sendNotification }): Promise<CallToolResult> => {
      try {
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: "Assembling complete agent package...",
          },
        });

        // Initialize complete agent structure
        const completeAgent: any = {
          agent: {
            name: (base_config as any).agent?.name || "generated-agent",
            title: (base_config as any).agent?.title || "Generated Agent",
            description: (base_config as any).agent?.description || "Agent generated from natural language",
            ...(base_config as any).agent
          },
          workflows,
          prompts,
          mappings,
          connectors: []
        };

        // Extract and deduplicate required connectors
        const requiredConnectors = extractRequiredConnectorsFromWorkflows(workflows);
        completeAgent.connectors = Array.from(requiredConnectors);

        // Merge context variables from all components
        const allContextVars = mergeContextVariables(workflows);
        if (!completeAgent.agent.context) {
          completeAgent.agent.context = {};
        }
        Object.assign(completeAgent.agent.context, allContextVars);

        // Link workflows to agent
        if (!completeAgent.agent.workflows) {
          completeAgent.agent.workflows = [];
        }

        workflows.forEach(workflow => {
          const workflowRef = {
            name: (workflow as any).workflow?.name,
            description: (workflow as any).workflow?.description || "",
            outputs: (workflow as any).workflow?.outputs || {}
          };
          completeAgent.agent.workflows.push(workflowRef);
        });

        // Validate completeness
        const validationResults = { errors: [] as string[], warnings: [] as string[] };
        if (validate_completeness) {
          Object.assign(validationResults, validateAgentCompleteness(completeAgent));
        }

        // Generate deployment package structure
        const deploymentPackage = createDeploymentPackage(completeAgent);
        const requiredApiKeys = listRequiredApiKeys(completeAgent);
        const performanceEstimate = estimateAgentPerformance(completeAgent);

        const agentYaml = yaml.dump(completeAgent, { indent: 2 });

        let result = `# Complete Agent Assembly: ${completeAgent.agent.name}\n\n`;
        
        if (validationResults.errors.length > 0) {
          result += `## ❌ Validation Errors\n\n`;
          validationResults.errors.forEach(error => {
            result += `- ${error}\n`;
          });
          result += '\n';
        }

        if (validationResults.warnings.length > 0) {
          result += `## ⚠️ Validation Warnings\n\n`;
          validationResults.warnings.forEach(warning => {
            result += `- ${warning}\n`;
          });
          result += '\n';
        }

        result += `## Complete Agent Configuration\n\n\`\`\`yaml\n${agentYaml}\n\`\`\`\n\n`;
        
        result += `## Deployment Package Structure\n\n`;
        result += generateDeploymentStructure(deploymentPackage);

        result += `\n## Required API Keys\n\n`;
        requiredApiKeys.forEach(key => {
          result += `- \`${key}\`\n`;
        });

        result += `\n## Performance Estimates\n\n`;
        result += `- **Estimated Latency**: ${performanceEstimate.latency}ms\n`;
        result += `- **Estimated Cost per Run**: $${performanceEstimate.cost}\n`;
        result += `- **Workflow Count**: ${workflows.length}\n`;
        result += `- **Connector Count**: ${completeAgent.connectors.length}\n`;

        result += `\n## Deployment Commands\n\n\`\`\`bash\n`;
        deploymentPackage.deployment_commands.forEach((cmd: string) => {
          result += `${cmd}\n`;
        });
        result += `\`\`\`\n`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error assembling complete agent:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error assembling complete agent: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Helper functions for the new tools

  function getConnectorInfo(connectorName: string) {
    const connectorMap: Record<string, any> = {
      "sportradar-soccer": {
        type: "data",
        description: "SportRadar Soccer API connector for match data, statistics, and team information",
        requiresApiKey: true,
        supportedSports: ["soccer"],
        commands: [
          {
            name: "get_match_summary",
            description: "Get summary of a soccer match",
            parameters: ["match_id", "season_id"],
            schema: { match_id: "string", season_id: "string" }
          },
          {
            name: "get_team_profile",
            description: "Get team profile and statistics",
            parameters: ["team_id"],
            schema: { team_id: "string" }
          }
        ]
      },
      "sportradar-nba": {
        type: "data",
        description: "SportRadar NBA API connector for game data, player statistics, and team information",
        requiresApiKey: true,
        supportedSports: ["basketball", "nba"],
        commands: [
          {
            name: "get_game_summary",
            description: "Get summary of an NBA game",
            parameters: ["game_id"],
            schema: { game_id: "string" }
          },
          {
            name: "get_player_profile",
            description: "Get player profile and statistics",
            parameters: ["player_id"],
            schema: { player_id: "string" }
          }
        ]
      },
      "sportradar-nfl": {
        type: "data",
        description: "SportRadar NFL API connector for game data, player statistics, and team information",
        requiresApiKey: true,
        supportedSports: ["football", "nfl"],
        commands: [
          {
            name: "get_game_summary",
            description: "Get summary of an NFL game",
            parameters: ["game_id"],
            schema: { game_id: "string" }
          },
          {
            name: "get_team_roster",
            description: "Get team roster and player information",
            parameters: ["team_id"],
            schema: { team_id: "string" }
          }
        ]
      },
      "openai": {
        type: "ai",
        description: "OpenAI API connector for language models and embeddings",
        requiresApiKey: true,
        commands: [
          {
            name: "chat_completion",
            description: "Generate chat completions",
            parameters: ["messages", "model", "temperature"],
            schema: { 
              messages: "array", 
              model: "string", 
              temperature: "number" 
            }
          }
        ]
      },
      "groq": {
        type: "ai",
        description: "Groq API connector for fast inference",
        requiresApiKey: true,
        commands: [
          {
            name: "chat_completion",
            description: "Generate chat completions with fast inference",
            parameters: ["messages", "model"],
            schema: { messages: "array", model: "string" }
          }
        ]
      },
      "stability": {
        type: "ai",
        description: "Stability AI connector for image generation",
        requiresApiKey: true,
        commands: [
          {
            name: "text_to_image",
            description: "Generate images from text prompts",
            parameters: ["prompt", "model", "width", "height"],
            schema: { 
              prompt: "string", 
              model: "string", 
              width: "number", 
              height: "number" 
            }
          }
        ]
      },
      "perplexity": {
        type: "ai",
        description: "Perplexity AI connector for search-augmented responses",
        requiresApiKey: true,
        commands: [
          {
            name: "search_completion",
            description: "Generate responses with real-time search",
            parameters: ["messages", "model"],
            schema: { messages: "array", model: "string" }
          }
        ]
      }
    };

    return connectorMap[connectorName] || null;
  }

  function analyzeFieldCompatibility(sourceSchema: any, targetSchema: any): Record<string, string> {
    const mappings: Record<string, string> = {};
    const sourceProps = sourceSchema.properties || {};
    const targetProps = targetSchema.properties || {};

    // Ensure targetProps is a proper object before iterating
    const targetPropsObj = targetProps as Record<string, any>;
    
    for (const [targetField] of Object.entries(targetPropsObj)) {
      // Direct name match
      if (sourceProps[targetField]) {
        mappings[targetField] = targetField;
        continue;
      }

      // Common aliases
      const aliases: Record<string, string[]> = {
        "id": ["_id", "identifier", "uid"],
        "name": ["title", "label", "display_name"],
        "description": ["desc", "summary", "details"],
        "timestamp": ["time", "datetime", "created_at", "date"],
        "status": ["state", "condition"],
        "type": ["category", "kind"],
        "value": ["amount", "score", "number"]
      };

      // Check aliases
      for (const [aliasGroup, aliasList] of Object.entries(aliases)) {
        if (targetField === aliasGroup) {
          for (const alias of aliasList) {
            if (sourceProps[alias]) {
              mappings[targetField] = alias;
              break;
            }
          }
        } else if (aliasList.includes(targetField) && sourceProps[aliasGroup]) {
          mappings[targetField] = aliasGroup;
          break;
        }
      }

      // Fuzzy matching for similar names
      if (!mappings[targetField]) {
        for (const sourceField of Object.keys(sourceProps)) {
          const similarity = calculateFieldSimilarity(targetField, sourceField);
          if (similarity > 0.8) {
            mappings[targetField] = sourceField;
            break;
          }
        }
      }
    }

    return mappings;
  }

  function calculateFieldSimilarity(field1: string, field2: string): number {
    const field1Parts = new Set(field1.toLowerCase().split(/[_-]/));
    const field2Parts = new Set(field2.toLowerCase().split(/[_-]/));
    
    if (field1Parts.size === 0 || field2Parts.size === 0) return 0;
    
    const intersection = new Set(Array.from(field1Parts).filter(x => field2Parts.has(x)));
    const union = new Set([...Array.from(field1Parts), ...Array.from(field2Parts)]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  function inferFieldType(schema: any, fieldName: string): string {
    const field = schema.properties?.[fieldName];
    return field?.type || "string";
  }

  function isFieldRequired(schema: any, fieldName: string): boolean {
    return schema.required?.includes(fieldName) || false;
  }

  function generateTransformations(sourceSchema: any, targetSchema: any, mappings: Record<string, string>): Record<string, any> {
    const transformations: Record<string, any> = {};
    
    // Add common transformations
    for (const [targetField, sourceField] of Object.entries(mappings)) {
      const sourceType = inferFieldType(sourceSchema, sourceField);
      const targetType = inferFieldType(targetSchema, targetField);
      
      if (sourceType !== targetType) {
        if (sourceType === "string" && targetType === "number") {
          transformations[`${targetField}_transform`] = {
            path: `$.get('${sourceField}')`,
            transform: "parseInt"
          };
        } else if (sourceType === "number" && targetType === "string") {
          transformations[`${targetField}_transform`] = {
            path: `$.get('${sourceField}')`,
            transform: "toString"
          };
        }
      }
    }
    
    return transformations;
  }

  function getSchemaForUseCase(useCase: string): any {
    const schemas: Record<string, any> = {
      chat: {
        title: "ChatCompletions",
        type: "object",
        properties: {
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                message: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["assistant"] },
                    content: { type: "string" }
                  },
                  required: ["role", "content"]
                }
              },
              required: ["message"]
            }
          }
        },
        required: ["choices"]
      },
      content: {
        title: "ContentGeneration",
        type: "object",
        properties: {
          title: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                heading: { type: "string" },
                content: { type: "string" }
              },
              required: ["heading", "content"]
            }
          },
          summary: { type: "string" },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["title", "sections"]
      },
      quiz: {
        title: "QuizGeneration",
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correct_answer: { type: "string" },
                explanation: { type: "string" }
              },
              required: ["question", "options", "correct_answer"]
            }
          }
        },
        required: ["questions"]
      },
      general: {
        title: "GeneralResponse",
        type: "object",
        properties: {
          content: { type: "string" },
          metadata: { type: "object" }
        },
        required: ["content"]
      }
    };

    return schemas[useCase] || schemas.general;
  }

  function enhanceSchemaWithFields(baseSchema: any, requiredFields: string[], outputFormat: string): any {
    const enhanced = JSON.parse(JSON.stringify(baseSchema));
    
    // Add required fields to schema
    if (!enhanced.properties) enhanced.properties = {};
    if (!enhanced.required) enhanced.required = [];
    
    requiredFields.forEach(field => {
      if (!enhanced.properties[field]) {
        enhanced.properties[field] = { type: "string" };
        enhanced.required.push(field);
      }
    });

    // Adjust for output format
    if (outputFormat === "markdown") {
      enhanced.properties.markdown_content = { type: "string" };
    } else if (outputFormat === "json") {
      enhanced.properties.json_data = { type: "object" };
    }

    return enhanced;
  }

  function optimizeSchemaForModel(schema: any, model: string): any {
    const optimized = JSON.parse(JSON.stringify(schema));
    
    // Model-specific optimizations
    if (model.includes("gpt-4")) {
      // GPT-4 can handle more complex schemas
      optimized.additionalProperties = false;
    } else if (model.includes("groq")) {
      // Groq prefers simpler schemas for speed
      if (optimized.properties) {
        Object.values(optimized.properties).forEach((prop: any) => {
          if (prop.type === "object" && !prop.properties) {
            prop.additionalProperties = true;
          }
        });
      }
    }

    return optimized;
  }

  function estimateSchemaTokenUsage(schema: any): number {
    const schemaStr = JSON.stringify(schema);
    return Math.ceil(schemaStr.length / 4); // Rough estimation: 4 chars per token
  }

  function mergeDocumentSearches(workflow: any): { workflow: any, mergedCount: number } {
    const tasks = workflow.workflow?.tasks || [];
    let mergedCount = 0;
    const optimizedTasks: any[] = [];
    const searchCache: Record<string, string> = {};

    for (const task of tasks) {
      if (task.type === "document" && task.config?.action === "search") {
        const searchKey = `${task.inputs?.name}_${task.config?.['threshold-docs']}`;
        
        if (searchCache[searchKey]) {
          task.inputs = { ...task.inputs, cached_from: searchCache[searchKey] };
          mergedCount++;
        } else {
          searchCache[searchKey] = task.name;
          optimizedTasks.push(task);
        }
      } else {
        optimizedTasks.push(task);
      }
    }

    workflow.workflow.tasks = optimizedTasks;
    return { workflow, mergedCount };
  }

  function optimizeTaskOrder(workflow: any): { workflow: any, reordered: boolean } {
    // Simple reordering: move document searches before prompts
    const tasks = workflow.workflow?.tasks || [];
    const documentTasks = tasks.filter((t: any) => t.type === "document");
    const promptTasks = tasks.filter((t: any) => t.type === "prompt");
    const otherTasks = tasks.filter((t: any) => !["document", "prompt"].includes(t.type));
    
    const reorderedTasks = [...documentTasks, ...otherTasks, ...promptTasks];
    const reordered = JSON.stringify(tasks) !== JSON.stringify(reorderedTasks);
    
    workflow.workflow.tasks = reorderedTasks;
    return { workflow, reordered };
  }

  function identifyParallelTasks(workflow: any): string[][] {
    const tasks = workflow.workflow?.tasks || [];
    const parallelGroups: string[][] = [];
    
    // Group independent document searches
    const documentTasks = tasks.filter((t: any) => t.type === "document");
    if (documentTasks.length > 1) {
      parallelGroups.push(documentTasks.map((t: any) => t.name));
    }
    
    return parallelGroups;
  }

  function addParallelExecution(workflow: any, parallelGroups: string[][]): any {
    // Add parallel execution metadata
    if (!workflow.workflow.metadata) workflow.workflow.metadata = {};
    workflow.workflow.metadata.parallel_groups = parallelGroups;
    return workflow;
  }

  function optimizeForSpeed(workflow: any): any {
    // Add speed optimizations
    const tasks = workflow.workflow?.tasks || [];
    tasks.forEach((task: any) => {
      if (task.type === "prompt") {
        // Use faster models for speed optimization
        if (task.connector?.name === "openai") {
          task.connector.model = "gpt-3.5-turbo";
        }
      }
    });
    return workflow;
  }

  function optimizeForCost(workflow: any): any {
    // Add cost optimizations
    const tasks = workflow.workflow?.tasks || [];
    tasks.forEach((task: any) => {
      if (task.type === "prompt") {
        // Use more cost-effective models
        if (task.connector?.name === "openai") {
          task.connector.model = "gpt-3.5-turbo";
          task.connector.max_tokens = 1000; // Limit tokens for cost
        }
      }
    });
    return workflow;
  }

  function addIntelligentCaching(workflow: any): any {
    // Add caching configuration
    if (!workflow.workflow.config) workflow.workflow.config = {};
    workflow.workflow.config.caching = {
      enabled: true,
      ttl: 3600, // 1 hour cache
      cache_key_fields: ["entity_name", "date_range"]
    };
    return workflow;
  }

  function estimateWorkflowPerformance(workflow: any): any {
    const tasks = workflow.workflow?.tasks || [];
    const taskTimes: Record<string, number> = {
      connector: 500,
      document: 200,
      prompt: 1500,
      mapping: 50
    };

    let totalTime = 0;
    const bottlenecks: string[] = [];

    tasks.forEach((task: any) => {
      const taskTime = taskTimes[task.type] || 100;
      totalTime += taskTime;
      
      if (taskTime > 1000) {
        bottlenecks.push(task.name);
      }
    });

    return {
      latency: totalTime,
      parallelizable: tasks.some((t: any) => t.type === "document"),
      bottlenecks
    };
  }

  function estimateWorkflowCost(workflow: any): any {
    const tasks = workflow.workflow?.tasks || [];
    let totalCost = 0;

    tasks.forEach((task: any) => {
      if (task.type === "prompt") {
        const model = task.connector?.model || "gpt-3.5-turbo";
        if (model.includes("gpt-4")) {
          totalCost += 0.03; // Rough estimate
        } else {
          totalCost += 0.001;
        }
      }
    });

    return { cost: totalCost.toFixed(4) };
  }

  function extractWorkflowVariables(workflow: any): Record<string, string[]> {
    const variables: Record<string, string[]> = {};
    const tasks = workflow.workflow?.tasks || [];

    tasks.forEach((task: any) => {
      if (task.connector?.name) {
        const connectorName = task.connector.name;
        if (!variables[connectorName]) {
          variables[connectorName] = [];
        }
        variables[connectorName].push(task.name);
      }
    });

    return variables;
  }

  function extractContextVariables(context: any): string[] {
    const variables: string[] = [];
    
    if (context && typeof context === 'object') {
      Object.keys(context).forEach(key => {
        if (key.includes('api') || key.includes('key')) {
          variables.push(key);
        }
      });
    }

    return variables;
  }

  function generateDefaultVariables(varCategory: string): any {
    const defaults: Record<string, any> = {
      "default": {
        api_key: `$TEMP_CONTEXT_VARIABLE_SDK_${varCategory.toUpperCase().replace('-', '_')}_API_KEY`
      }
    };

    return defaults[varCategory] || defaults.default;
  }

  function validateVariableReferences(agentConfig: any, contextConfig: any): string[] {
    const errors: string[] = [];
    
    // Check if all referenced connectors have corresponding context variables
    const workflows = agentConfig.workflows || [];
    const contextVars = Object.keys(contextConfig["context-variables"] || {});
    
    workflows.forEach((workflow: any) => {
      const tasks = workflow.workflow?.tasks || [];
      tasks.forEach((task: any) => {
        if (task.connector?.name && !contextVars.includes(task.connector.name)) {
          errors.push(`Missing context variable for connector: ${task.connector.name}`);
        }
      });
    });

    return errors;
  }

  function listEnvironmentVariables(contextConfig: any): string[] {
    const envVars: string[] = [];
    const contextVars = contextConfig["context-variables"] || {};
    
    Object.values(contextVars).forEach((varConfig: any) => {
      if (varConfig && typeof varConfig === 'object') {
        Object.values(varConfig).forEach((value: any) => {
          if (typeof value === 'string' && value.startsWith('$TEMP_CONTEXT_VARIABLE_')) {
            envVars.push(value.replace('$TEMP_CONTEXT_VARIABLE_SDK_', ''));
          }
        });
      }
    });

    return Array.from(new Set(envVars));
  }

  function extractRequiredConnectorsFromWorkflows(workflows: any[]): Set<string> {
    const connectors = new Set<string>();
    
    workflows.forEach(workflow => {
      const tasks = workflow.workflow?.tasks || [];
      tasks.forEach((task: any) => {
        if (task.connector?.name) {
          connectors.add(task.connector.name);
        }
      });
    });

    return connectors;
  }

  function mergeContextVariables(workflows: any[]): any {
    const merged: any = {};
    
    workflows.forEach(workflow => {
      if (workflow.workflow?.context) {
        Object.assign(merged, workflow.workflow.context);
      }
    });

    return merged;
  }

  function validateAgentCompleteness(agent: any): { errors: string[], warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required agent fields
    if (!agent.agent?.name) {
      errors.push("Agent name is required");
    }

    // Check workflows
    if (!agent.workflows || agent.workflows.length === 0) {
      errors.push("At least one workflow is required");
    }

    // Validate workflow references
    const workflowNames = new Set(agent.workflows?.map((w: any) => w.workflow?.name) || []);
    agent.agent?.workflows?.forEach((agentWf: any) => {
      if (!workflowNames.has(agentWf.name)) {
        errors.push(`Referenced workflow '${agentWf.name}' not found`);
      }
    });

    return { errors, warnings };
  }

  function createDeploymentPackage(agent: any): any {
    const agentName = agent.agent.name;
    
    return {
      directory_structure: {
        [`${agentName}/`]: {
          "agent.yml": agent.agent,
          "workflows/": Object.fromEntries(
            agent.workflows.map((w: any) => [`${w.workflow.name}.yml`, w])
          ),
          "prompts/": Object.fromEntries(
            agent.prompts.map((p: any) => [`${p.name}.yml`, p])
          ),
          "mappings/": Object.fromEntries(
            agent.mappings.map((m: any) => [`${m.mapping.name}.yml`, m])
          ),
          "README.md": generateAgentReadme(agent)
        }
      },
      deployment_commands: [
        `cd ${agentName}`,
        "machina agent install .",
        `machina agent deploy ${agentName}`
      ]
    };
  }

  function generateAgentReadme(agent: any): string {
    const apiKeys = listRequiredApiKeys(agent);
    
    return `# ${agent.agent.title}

${agent.agent.description}

## Installation

1. Install required connectors:
   \`\`\`bash
   ${agent.connectors.map((c: string) => `machina connector install ${c}`).join('\n   ')}
   \`\`\`

2. Configure API keys:
   \`\`\`bash
   ${apiKeys.map((key: string) => `export ${key}=YOUR_API_KEY`).join('\n   ')}
   \`\`\`

3. Deploy agent:
   \`\`\`bash
   machina agent deploy ${agent.agent.name}
   \`\`\`

## Workflows

${agent.workflows.map((w: any) => `- **${w.workflow.name}**: ${w.workflow.description}`).join('\n')}

## Required API Keys

${apiKeys.map((key: string) => `- ${key}`).join('\n')}
`;
  }

  function listRequiredApiKeys(agent: any): string[] {
    const apiKeys = new Set<string>();
    
    agent.connectors?.forEach((connector: string) => {
      if (connector.includes('sportradar')) {
        apiKeys.add('SPORTRADAR_API_KEY');
      } else if (connector === 'openai') {
        apiKeys.add('OPENAI_API_KEY');
      } else if (connector === 'groq') {
        apiKeys.add('GROQ_API_KEY');
      } else if (connector === 'stability') {
        apiKeys.add('STABILITY_API_KEY');
      } else if (connector === 'perplexity') {
        apiKeys.add('PERPLEXITY_API_KEY');
      }
    });

    return Array.from(apiKeys);
  }

  function estimateAgentPerformance(agent: any): any {
    const workflows = agent.workflows || [];
    let totalLatency = 0;
    let totalCost = 0;

    workflows.forEach((workflow: any) => {
      const perf = estimateWorkflowPerformance(workflow);
      const cost = estimateWorkflowCost(workflow);
      
      totalLatency += perf.latency;
      totalCost += parseFloat(cost.cost);
    });

    return {
      latency: totalLatency,
      cost: totalCost.toFixed(4)
    };
  }

  function generateDeploymentStructure(deploymentPackage: any): string {
    let structure = "";
    
    function generateStructureRecursive(obj: any, indent: string = ""): void {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          structure += `${indent}📁 ${key}\n`;
          generateStructureRecursive(value, indent + "  ");
        } else {
          structure += `${indent}📄 ${key}\n`;
        }
      });
    }
    
    generateStructureRecursive(deploymentPackage.directory_structure);
    return structure;
  }

  return server;
};
