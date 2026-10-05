<script setup>
import { computed, h, watchEffect } from 'vue'
import {
  ICON_REGISTRY,
  hasIcon,
  normalizeIconName,
} from './iconRegistry.generated.js'

const MDS_ICON_SIZES = Object.freeze([12, 16, 20, 24, 28, 32, 36, 40, 44, 48])

const props = defineProps({
  name: { type: String, required: true },
  size: {
    type: [Number, String],
    default: 24,
    validator: (value) =>
      [12, 16, 20, 24, 28, 32, 36, 40, 44, 48].includes(Number(value)),
  },
  filled: { type: Boolean, default: false },
  title: { type: String, default: '' },
})

const requestedName = computed(() => normalizeIconName(props.name))
const filledName = computed(() => `${requestedName.value}-filled`)
const resolvedName = computed(() =>
  props.filled && hasIcon(filledName.value) ? filledName.value : requestedName.value
)
const icon = computed(() => ICON_REGISTRY[resolvedName.value] || null)
const nodes = computed(() => icon.value?.nodes || [])
const vectorAttrs = computed(() => icon.value?.attrs || {})
const pixelSize = computed(() => {
  const value = Number(props.size)
  return MDS_ICON_SIZES.includes(value) ? value : 24
})

function renderNode(node, index) {
  return h(
    node.tag,
    { ...node.attrs, key: `${node.tag}-${index}` },
    node.children?.map(renderNode)
  )
}

const IconGlyph = (renderProps) => renderProps.nodes.map(renderNode)
IconGlyph.props = ['nodes']

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (!hasIcon(requestedName.value)) {
      console.warn(`[MIcon] Icon "${requestedName.value}" is not in the verified MDS bundle.`)
    } else if (props.filled && !hasIcon(filledName.value)) {
      console.warn(`[MIcon] Filled variant "${filledName.value}" is unavailable; rendering outline.`)
    }
  })
}
</script>

<template>
  <svg
    v-if="nodes.length"
    xmlns="http://www.w3.org/2000/svg"
    :width="pixelSize"
    :height="pixelSize"
    viewBox="0 0 24 24"
    v-bind="vectorAttrs"
    :aria-hidden="title ? undefined : 'true'"
    :role="title ? 'img' : undefined"
    class="inline-block shrink-0"
  >
    <title v-if="title">{{ title }}</title>
    <IconGlyph :nodes="nodes" />
  </svg>
</template>
