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
        
        // Parse data sources
        const dataSources = data_sources ? data_sources.split(',').map(s => s.trim()) : [];
        
        // Build the agent template object
        const template = {
          name: templateName,
          description: description,
          version: "1.0.0",
          language: language,
          sport: sport,
          configuration: {
            output_format: output_format,
            use_case: use_case,
            data_sources: dataSources.length > 0 ? dataSources : [`${sport}-data`, "web-search"],
          },
          prompts: {
            system: `You are a specialized sports AI agent focusing on ${sport}. Your primary task is to ${description} in ${language === "en" ? "English" : language === "es" ? "Spanish" : "Brazilian Portuguese"}.`,
            examples: include_examples ? [
              {
                role: "user",
                content: `Generate a ${use_case} for the recent ${sport} match between Team A and Team B.`
              },
              {
                role: "assistant",
                content: `I'll create a detailed ${use_case} for the ${sport} match between Team A and Team B.`
              }
            ] : [],
          },
          workflows: [
            {
              name: "default",
              description: `Default workflow for ${use_case} generation`,
              steps: [
                {
                  name: "fetch-data",
                  type: "data-fetch",
                  config: {
                    source: dataSources[0] || `${sport}-data`,
                  }
                },
                {
                  name: "process-data",
                  type: "data-processing",
                  config: {
                    format: "structured",
                    fields: ["date", "teams", "scores", "key_events", "statistics"]
                  }
                },
                {
                  name: "generate-content",
                  type: "content-generation",
                  config: {
                    format: output_format,
                    max_length: 1000,
                    include_statistics: true
                  }
                }
              ]
            }
          ]
        };
        
        // Convert to YAML
        const yamlTemplate = yaml.dump(template, { indent: 2 });
        
        return {
          content: [
            {
              type: "text",
              text: `# Generated ${sport} ${use_case} Agent Template\n\nHere's your new agent template for ${description}:\n\n\`\`\`yaml\n${yamlTemplate}\n\`\`\`\n\n## Usage Instructions\n\nSave this YAML to a file named \`${templateName}.yaml\` and import it into your Machina instance. Make sure you have the required connectors installed:\n\n${dataSources.map(ds => `- ${ds}`).join('\n') || "- No specific data sources required"}\n\nYou can customize this template further by adding more steps or modifying the prompts to better fit your specific needs.`,
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
      
      // Match data source to actual connectors
      if (data_source.includes("sportradar")) {
        const sportType = data_source.split('-')[1] || sport;
        connectorContext = `The ${data_source} connector provides comprehensive ${sportType.toUpperCase()} data including player statistics, team performance, and game events.`;
        
        if (sportType === "nba") {
          analysisGuidance = "Consider both traditional stats (points, rebounds, assists) and advanced metrics (PER, true shooting percentage, etc.)";
        } else if (sportType === "nfl") {
          analysisGuidance = "For NFL analysis, focus on situational statistics, efficiency metrics, and contextual performance";
        } else if (sportType === "mlb") {
          analysisGuidance = "MLB analysis should consider sabermetrics like OPS, WAR, and ERA+ for deeper insights";
        } else if (sportType === "soccer") {
          analysisGuidance = "For soccer, consider possession metrics, expected goals (xG), and defensive contributions";
        }
      } else if (data_source.includes("fastf1")) {
        connectorContext = "The fastf1 connector provides Formula 1 racing data including lap times, tire strategies, and car telemetry.";
        analysisGuidance = "F1 analysis should consider factors like tire degradation, track position, and race strategy";
      } else if (data_source.includes("statsapi")) {
        connectorContext = "The mlb-statsapi connector offers detailed baseball statistics and play-by-play information.";
        analysisGuidance = "Consider traditional and advanced statistics to provide a comprehensive view of performance";
      } else if (data_source.includes("tallysight")) {
        connectorContext = "The tallysight connector provides sports predictions and betting insights across multiple sports.";
        analysisGuidance = "Focus on probability-based analysis and prediction accuracy metrics";
      } else {
        connectorContext = `The ${data_source} connector provides specialized data for ${sport} analysis.`;
        analysisGuidance = "Focus on the most relevant metrics for your specific analysis goals";
      }
      
      // Format metrics
      const metricsList = metrics ? metrics.split(',').map(m => m.trim()).join(', ') : "all relevant metrics";
      
      // Format entities
      const entitiesDisplay = entities.length > 0 
        ? `Entities to analyze: ${entities.join(', ')}`
        : "Analyze all relevant entities in the dataset";
      
      const outputGuidance = output_format === 'json' 
        ? "Provide a structured JSON response with clearly labeled metrics and insights."
        : output_format === 'markdown' 
        ? "Format your response with Markdown for headings, lists, and emphasis."
        : output_format === 'html'
        ? "Structure your response with appropriate HTML tags for web display."
        : "Provide a clear, well-organized text response.";
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a data analyst specializing in ${sport}. Generate insights using data from the ${data_source} connector.

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
