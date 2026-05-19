import React, { useEffect, useState, useCallback } from 'react'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  SelectionMode,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  MarkerType,
  Handle,
  Position,
} from 'reactflow'
import { UsersIcon, RefreshCwIcon, BuildingIcon } from 'lucide-react'
import 'reactflow/dist/style.css'
import api from '../lib/api'

// Enhanced Custom node component
const CustomNode = ({ data }: { data: any }) => {
  const fullName = data.label || data.name || 'Unknown User'
  const role = data.role || data.subtitle || 'Employee'
  const position = data.position || ''
  
  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'superuser':
        return 'bg-red-50 border-red-200 text-red-900'
      case 'manager':
        return 'bg-neutral-50 border-neutral-200 text-neutral-900'
      default:
        return 'bg-green-50 border-green-200 text-green-900'
    }
  }
  
  return (
    <div className="group">
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
      
      <div className={`px-6 py-4 shadow-lg rounded-xl border-2 min-w-[220px] max-w-[240px] transform transition-all duration-300 hover:scale-105 hover:shadow-xl ${getRoleColor(role)} backdrop-blur-sm`}>
        {/* User Avatar */}
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
            <span className="text-lg font-bold text-gray-600">
              {fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
            </span>
          </div>
        </div>
        
        {/* User Info */}
        <div className="text-center">
          <h3 className="font-bold text-sm leading-tight mb-2">
            {fullName}
          </h3>
          {position && (
            <p className="text-xs font-medium text-neutral-900 mb-1">
              {position}
            </p>
          )}
          <p className="text-xs opacity-75 capitalize">
            {role}
          </p>
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

export default function OrgTree() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [users, setUsers] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadHierarchy = useCallback(async () => {
    try {
      setLoading(true)
      
      const [hierarchyRes, usersRes, meRes] = await Promise.all([
        api.get('/org-tree/'),
        api.get('/users/light/'),
        api.get('/auth/me/'),
      ])

      const hierarchy = hierarchyRes.data
      const usersData = usersRes.data

      if (!hierarchy.nodes || hierarchy.nodes.length === 0) {
        setNodes([])
        setEdges([])
        setUsers(usersData)
        setMe(meRes.data)
        setLoading(false)
        return
      }

      const processedNodes = hierarchy.nodes.map((node: any) => ({
        ...node,
        id: String(node.id),
        type: 'custom',
        data: {
          ...node.data,
          label: node.data.label || node.data.name || 'Unknown User',
          name: node.data.label || node.data.name || 'Unknown User',
          role: node.data.role || 'Employee',
          position: node.data.position || node.data.subtitle || '',
          subtitle: node.data.subtitle || node.data.position || node.data.role
        }
      }))

      const derivedEdgesFromUsers = (usersData || [])
        .map((u: any) => {
          const managerId = u.manager ?? u.manager_id
          if (!managerId) return null
          return {
            id: `${String(managerId)}-${String(u.id)}`,
            source: String(managerId),
            target: String(u.id),
          }
        })
        .filter(Boolean) as Edge[]

      const baseEdges = (hierarchy.edges && hierarchy.edges.length > 0)
        ? hierarchy.edges
        : derivedEdgesFromUsers

      const normalizedEdges = baseEdges.map((edge: any) => ({
        ...edge,
        source: String(edge.source),
        target: String(edge.target),
      }))

      const layoutedNodes = layoutNodes(processedNodes, normalizedEdges)

      const processedEdges = normalizedEdges.map((edge: any) => ({
        ...edge,
        id: edge.id || `${edge.source}-${edge.target}`,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: '#6b7280',
          strokeWidth: 2,
          ...edge.style
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }
      }))

      setNodes(layoutedNodes)
      setEdges(processedEdges)
      setUsers(usersData)
      setMe(meRes.data)
    } catch (error) {
      setNodes([])
      setEdges([])
      setUsers([])
      setMe(null)
      console.error('Failed to load organization hierarchy:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHierarchy()
  }, [loadHierarchy])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="flex justify-between items-center">
              <div className="h-8 bg-gray-200 rounded w-64"></div>
              <div className="h-10 w-24 bg-gray-200 rounded"></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm h-96"></div>
          </div>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 animate-in fade-in duration-500">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-neutral-100 rounded-lg">
              <BuildingIcon className="w-6 h-6 text-neutral-900" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Organization Chart</h1>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="p-4 bg-gray-100 rounded-full w-fit mx-auto mb-6">
                <UsersIcon className="w-12 h-12 text-gray-400" />
              </div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">No Organization Data</h2>
              <p className="text-gray-600 mb-6">
                No users found in the organization. Go to the Admin page to create users and assign managers to build your organization chart.
              </p>
              
              <button 
                onClick={loadHierarchy}
                className="inline-flex items-center px-6 py-3 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-700 focus:ring-offset-2 transition-all duration-200 transform hover:scale-105"
              >
                <RefreshCwIcon className="w-5 h-5 mr-2" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50 animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-100 rounded-lg">
              <BuildingIcon className="w-6 h-6 text-neutral-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Organization Chart</h1>
              <p className="text-gray-600 mt-1">{nodes.length} team members</p>
            </div>
          </div>
          
          <button 
            onClick={loadHierarchy}
            className="inline-flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-neutral-700 focus:ring-offset-2 transition-all duration-200 transform hover:scale-105"
          >
            <RefreshCwIcon className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
        
        {/* Organization Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 animate-in slide-in-from-bottom duration-500 delay-200">
          <div style={{ height: '700px' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              attributionPosition="bottom-left"
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: false,
                style: { stroke: '#6b7280', strokeWidth: 2 }
              }}
              panOnScroll
              selectionOnDrag
              panOnDrag={[1, 2]}
              selectionMode={SelectionMode.Partial}
            >
              <Controls 
                className="bg-white border border-gray-200 shadow-lg rounded-lg"
                showZoom={true}
                showFitView={true}
                showInteractive={false}
              />
              <MiniMap 
                className="bg-white border border-gray-200 shadow-lg rounded-lg"
                nodeColor={(node) => {
                  const role = node.data?.role || 'employee'
                  return role === 'superuser' ? '#dc2626' : 
                         role === 'manager' ? '#2563eb' : '#16a34a'
                }}
                position="bottom-right"
                pannable
                zoomable
              />
              <Background 
                variant={BackgroundVariant.Dots} 
                gap={20} 
                size={1} 
                color="#f3f4f6"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-bottom duration-500 delay-300">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-sm text-gray-700">Superuser</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-neutral-700"></div>
              <span className="text-sm text-gray-700">Manager</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-sm text-gray-700">Employee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const children = new Map<string, string[]>()
  const parents = new Map<string, string>()

  edges.forEach(edge => {
    if (!children.has(edge.source)) {
      children.set(edge.source, [])
    }
    children.get(edge.source)!.push(edge.target)
    parents.set(edge.target, edge.source)
  })

  let rootNodes = nodes.filter(node => !parents.has(node.id))

  rootNodes.sort((a, b) => {
    const aRole = a.data?.role || ''
    const bRole = b.data?.role || ''
    if (aRole === 'superuser') return -1
    if (bRole === 'superuser') return 1
    if (aRole === 'manager') return -1
    if (bRole === 'manager') return 1
    return 0
  })

  if (rootNodes.length === 0) {
    rootNodes = nodes
  }

  const layoutedNodes: Node[] = []
  const levelHeight = 250
  const nodeWidth = 240 // approximate node width
  const horizontalSpacing = 50 // space between nodes

  // Calculate subtree widths bottom-up
  const subtreeWidths = new Map<string, number>()

  function calculateSubtreeWidth(nodeId: string): number {
    const nodeChildren = children.get(nodeId) || []
    if (nodeChildren.length === 0) {
      subtreeWidths.set(nodeId, nodeWidth)
      return nodeWidth
    }

    let totalWidth = 0
    nodeChildren.forEach(childId => {
      totalWidth += calculateSubtreeWidth(childId)
    })
    totalWidth += (nodeChildren.length - 1) * horizontalSpacing

    subtreeWidths.set(nodeId, Math.max(nodeWidth, totalWidth))
    return Math.max(nodeWidth, totalWidth)
  }

  // Calculate widths for all nodes
  nodes.forEach(node => {
    if (!subtreeWidths.has(node.id)) {
      calculateSubtreeWidth(node.id)
    }
  })

  // Position nodes top-down
  function positionNode(nodeId: string, level: number, x: number): number {
    const node = nodeMap.get(nodeId)
    if (!node) return x

    const nodeWithPosition = {
      ...node,
      position: {
        x: x,
        y: level * levelHeight + 100
      }
    }
    layoutedNodes.push(nodeWithPosition)

    const nodeChildren = children.get(nodeId) || []
    if (nodeChildren.length > 0) {
      const subtreeWidth = subtreeWidths.get(nodeId) || nodeWidth
      let childX = x - (subtreeWidth - nodeWidth) / 2

      // Calculate total width of all children
      let totalChildrenWidth = 0
      nodeChildren.forEach(childId => {
        totalChildrenWidth += subtreeWidths.get(childId) || nodeWidth
      })
      totalChildrenWidth += (nodeChildren.length - 1) * horizontalSpacing

      // Adjust childX to center children under parent
      childX = x - totalChildrenWidth / 2

      nodeChildren.forEach(childId => {
        const childSubtreeWidth = subtreeWidths.get(childId) || nodeWidth
        positionNode(childId, level + 1, childX + childSubtreeWidth / 2 - nodeWidth / 2)
        childX += childSubtreeWidth + horizontalSpacing
      })
    }

    return x + (subtreeWidths.get(nodeId) || nodeWidth)
  }

  // Position root nodes
  let currentX = 0
  rootNodes.forEach(rootNode => {
    const width = subtreeWidths.get(rootNode.id) || nodeWidth
    positionNode(rootNode.id, 0, currentX + width / 2 - nodeWidth / 2)
    currentX += width + horizontalSpacing
  })

  return layoutedNodes
}
