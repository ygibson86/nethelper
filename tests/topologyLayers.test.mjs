import assert from 'node:assert/strict'
import test from 'node:test'
import { topologyLayers, topologyNodeZIndex, topologyEdgeZIndex } from '../src/topologyLayers.ts'

test('selected nodes rise above every edge and label, independent of node type', () => {
  for (const type of ['device', 'text', 'group']) {
    const selected = topologyNodeZIndex(type, true)
    assert(selected > topologyLayers.selectedLabel)
    assert(selected > topologyEdgeZIndex(true))
    assert(selected > topologyNodeZIndex('device', false))
  }
})
test('selected edges and their labels rise above unselected elements', () => {
  assert(topologyEdgeZIndex(true) > topologyLayers.label)
  assert(topologyEdgeZIndex(true) > topologyNodeZIndex('device', false))
  assert(topologyLayers.selectedLabel > topologyEdgeZIndex(true))
  assert(topologyLayers.selectedLabel > topologyLayers.label)
})
test('deselection restores default layers and keeps background groups behind links', () => {
  assert.equal(topologyNodeZIndex('device', false), topologyLayers.node)
  assert.equal(topologyNodeZIndex('text'), topologyLayers.node)
  assert.equal(topologyNodeZIndex('group', false), topologyLayers.group)
  assert.equal(topologyEdgeZIndex(false), topologyLayers.edge)
  assert(topologyNodeZIndex('group') < topologyEdgeZIndex())
  assert(topologyEdgeZIndex() < topologyNodeZIndex('device'))
})
