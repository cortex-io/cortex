import React, { useState } from 'react';
import { GitBranch, Shield, FileText, Code, Users, AlertCircle, CheckCircle, Clock, ArrowRight, Plus, MessageSquare } from 'lucide-react';

const AgentWorkflow = () => {
  const [activeAgent, setActiveAgent] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  const agents = [
    {
      id: 'coder',
      name: 'Development Agent',
      icon: Code,
      color: 'bg-blue-500',
      role: 'Primary coding and feature development',
      responsibilities: [
        'Write and review code for new features',
        'Fix bugs and optimize existing code',
        'Implement technical specifications',
        'Run tests and ensure code quality',
        'Create and update documentation in code'
      ],
      handoffTriggers: [
        'Code complete → Security Agent (for security review)',
        'Feature ready → PR Agent (to create pull request)',
        'Documentation needed → Blog Agent (for user-facing docs)'
      ]
    },
    {
      id: 'security',
      name: 'Security Agent',
      icon: Shield,
      color: 'bg-red-500',
      role: 'Security auditing and dependency management',
      responsibilities: [
        'Scan for security vulnerabilities',
        'Monitor and update dependencies',
        'Review code for security issues',
        'Apply security patches',
        'Generate security reports'
      ],
      handoffTriggers: [
        'Security updates applied → PR Agent (create update PR)',
        'Critical vulnerability → ALL AGENTS (immediate notification)',
        'Audit complete → Development Agent (for fixes)'
      ]
    },
    {
      id: 'pr',
      name: 'PR Management Agent',
      icon: GitBranch,
      color: 'bg-green-500',
      role: 'Pull request creation and management',
      responsibilities: [
        'Create well-structured pull requests',
        'Write clear PR descriptions',
        'Update PR status and comments',
        'Manage merge conflicts',
        'Track PR review feedback'
      ],
      handoffTriggers: [
        'PR merged → Blog Agent (announce changes)',
        'Conflicts detected → Development Agent (resolve)',
        'Review feedback → Development Agent (implement changes)'
      ]
    },
    {
      id: 'blog',
      name: 'Content Agent',
      icon: FileText,
      color: 'bg-purple-500',
      role: 'Documentation and blog content',
      responsibilities: [
        'Write and update blog posts',
        'Create release notes',
        'Document new features',
        'Update README files',
        'Maintain project wikis'
      ],
      handoffTriggers: [
        'Technical questions → Development Agent (clarification)',
        'New feature content → PR Agent (add to repository)',
        'Security announcement → Security Agent (verify details)'
      ]
    },
    {
      id: 'coordinator',
      name: 'Coordination Agent',
      icon: Users,
      color: 'bg-yellow-500',
      role: 'Team coordination and oversight',
      responsibilities: [
        'Monitor all agent activities',
        'Coordinate handoffs between agents',
        'Identify gaps in coverage',
        'Propose new agents when needed',
        'Escalate issues to human owner'
      ],
      handoffTriggers: [
        'New challenge identified → Request human approval for new agent',
        'Resource conflict → Prioritize and delegate',
        'System-wide issue → Alert all agents and human'
      ]
    }
  ];

  const workflow = [
    {
      phase: 'Initialization',
      steps: [
        'Coordinator Agent surveys all repositories',
        'Each agent establishes their monitoring scope',
        'Agents report current status and pending tasks'
      ]
    },
    {
      phase: 'Daily Operations',
      steps: [
        'Security Agent runs automated scans',
        'Development Agent checks for issues and feature requests',
        'PR Agent monitors open PRs and reviews',
        'Content Agent reviews documentation freshness',
        'Coordinator Agent synthesizes reports'
      ]
    },
    {
      phase: 'Task Execution',
      steps: [
        'Agent receives or identifies a task',
        'Agent executes within their domain',
        'Agent documents their work',
        'Agent determines if handoff is needed',
        'Handoff occurs with full context transfer'
      ]
    },
    {
      phase: 'Inter-Agent Communication',
      steps: [
        'Agents share status updates in shared log',
        'Blocked tasks escalated to Coordinator',
        'Coordinator facilitates agent-to-agent discussions',
        'Consensus reached on complex decisions',
        'Human approval requested when needed'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Multi-Agent GitHub Repository Management System</h1>
          <p className="text-gray-300 text-lg">Autonomous AI agents working together to manage your repositories</p>
        </div>

        {/* System Overview */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-yellow-500" />
            System Overview
          </h2>
          <p className="text-gray-300 mb-4">
            This workflow establishes five specialized AI agents that collaborate to manage your GitHub repositories. 
            Each agent has distinct responsibilities but can communicate, hand off tasks, and collectively propose 
            creating new agents when they identify gaps in coverage or unforeseen challenges.
          </p>
          <div className="bg-gray-900 rounded p-4 border border-yellow-500/30">
            <p className="text-yellow-300 font-semibold mb-2">⚠️ Implementation Note:</p>
            <p className="text-gray-300 text-sm">
              To implement this on your Claude Pro machine, you'll initiate each agent as a separate conversation 
              with a specific system prompt. Each agent monitors a shared task log (Google Doc, Notion, or GitHub 
              Issues) for coordination and handoffs.
            </p>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Agent Roles & Responsibilities</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => {
              const Icon = agent.icon;
              const isActive = activeAgent === agent.id;
              return (
                <div
                  key={agent.id}
                  className={`bg-gray-800 rounded-lg p-6 border-2 transition-all cursor-pointer ${
                    isActive ? 'border-white scale-105' : 'border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => setActiveAgent(isActive ? null : agent.id)}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`${agent.color} p-3 rounded-lg`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">{agent.name}</h3>
                  </div>
                  <p className="text-gray-400 text-sm mb-4 italic">{agent.role}</p>
                  
                  {isActive && (
                    <>
                      <div className="mb-4">
                        <h4 className="font-semibold mb-2 text-sm text-gray-300">Key Responsibilities:</h4>
                        <ul className="text-sm text-gray-400 space-y-1">
                          {agent.responsibilities.map((resp, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                              <span>{resp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-sm text-gray-300">Handoff Triggers:</h4>
                        <ul className="text-sm text-gray-400 space-y-1">
                          {agent.handoffTriggers.map((trigger, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                              <span>{trigger}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflow Phases */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Workflow Phases</h2>
          <div className="space-y-4">
            {workflow.map((phase, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <button
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-750"
                  onClick={() => setExpandedSection(expandedSection === idx ? null : idx)}
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-bold">{phase.phase}</h3>
                  </div>
                  <ArrowRight className={`w-5 h-5 transition-transform ${expandedSection === idx ? 'rotate-90' : ''}`} />
                </button>
                {expandedSection === idx && (
                  <div className="p-4 pt-0">
                    <ol className="space-y-2">
                      {phase.steps.map((step, stepIdx) => (
                        <li key={stepIdx} className="flex items-start gap-3 text-gray-300">
                          <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">
                            {stepIdx + 1}
                          </span>
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Agent Creation Protocol */}
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/30 mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Plus className="w-6 h-6" />
            Dynamic Agent Creation Protocol
          </h2>
          <p className="text-gray-300 mb-4">
            When agents encounter situations outside their expertise, the Coordination Agent facilitates a 
            multi-agent discussion to determine if a new specialized agent is needed.
          </p>
          <div className="bg-gray-900/50 rounded p-4 space-y-3">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-purple-400 mt-1" />
              <div>
                <p className="font-semibold text-purple-300">Step 1: Issue Identification</p>
                <p className="text-sm text-gray-400">Any agent identifies a challenge outside existing capabilities</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-blue-400 mt-1" />
              <div>
                <p className="font-semibold text-blue-300">Step 2: Agent Consultation</p>
                <p className="text-sm text-gray-400">Coordinator convenes all agents to discuss the gap</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-1" />
              <div>
                <p className="font-semibold text-yellow-300">Step 3: Human Approval Request</p>
                <p className="text-sm text-gray-400">Coordinator presents proposal to you with justification and scope</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Plus className="w-5 h-5 text-green-400 mt-1" />
              <div>
                <p className="font-semibold text-green-300">Step 4: Agent Initialization</p>
                <p className="text-sm text-gray-400">Upon approval, new agent is briefed and integrated into the workflow</p>
              </div>
            </div>
          </div>
        </div>

        {/* Implementation Guide */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">Implementation Guide for Claude Pro</h2>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-bold text-white mb-2">1. Setup Shared Communication Layer</h3>
              <p className="text-sm">Create a Google Doc, Notion page, or GitHub repository for agents to log activities, 
              hand off tasks, and communicate. Structure it with sections for each agent and a shared task queue.</p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-2">2. Initialize Each Agent</h3>
              <p className="text-sm">Start separate Claude Pro conversations for each agent with a system prompt that 
              includes their role, responsibilities, and instructions to check/update the shared communication layer regularly.</p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-2">3. Establish the Daily Routine</h3>
              <p className="text-sm">Each morning, prompt each agent to: check the shared log, report their status, 
              identify pending tasks, and execute their responsibilities.</p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-2">4. Monitor and Intervene</h3>
              <p className="text-sm">Check the Coordinator Agent's summary daily. Approve/reject agent creation proposals 
              and provide guidance when agents request human input.</p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-2">5. Iterate and Optimize</h3>
              <p className="text-sm">Based on performance, refine agent prompts, adjust responsibilities, and add new 
              agents as your repository needs evolve.</p>
            </div>
          </div>
        </div>

        {/* Sample Prompt */}
        <div className="mt-8 bg-gray-900 rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-bold mb-3">Sample Agent Initialization Prompt</h3>
          <p className="text-sm text-gray-400 mb-3">Copy and customize this prompt for each agent conversation:</p>
          <pre className="bg-black rounded p-4 text-xs text-green-400 overflow-x-auto">
{`You are the [AGENT NAME] in a multi-agent system managing GitHub repositories.

Your Role: [ROLE DESCRIPTION]

Your Responsibilities:
- [List responsibilities]

Communication Protocol:
1. Check the shared task log at [LINK] every time we interact
2. Log all your activities with timestamps
3. When you complete a task that requires handoff, create a handoff entry
4. If you encounter something outside your expertise, alert the Coordinator Agent

Handoff Triggers:
- [List handoff scenarios]

When uncertain or blocked, document the issue and request coordination. 
If you identify a need for a new type of agent, explain the gap and propose 
the new agent's role for human approval.

Current Date: [DATE]
Repositories under management: [LIST]

Begin by checking the shared log and reporting your current status.`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default AgentWorkflow;