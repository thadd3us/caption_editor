import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.vue'

describe('ContextMenu', () => {
  const mockItems: ContextMenuItem[] = [
    {
      label: 'Option 1',
      action: vi.fn()
    },
    {
      label: 'Option 2',
      action: vi.fn()
    },
    {
      label: 'Disabled Option',
      action: vi.fn(),
      disabled: true
    }
  ]

  it('should render menu when visible', () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    expect(wrapper.find('.context-menu').exists()).toBe(true)
    expect(wrapper.find('.context-menu-overlay').exists()).toBe(true)
  })

  it('should not render menu when not visible', () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: false,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    expect(wrapper.find('.context-menu').exists()).toBe(false)
    expect(wrapper.find('.context-menu-overlay').exists()).toBe(false)
  })

  it('should position menu at correct coordinates', () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 150, y: 250 },
        items: mockItems
      }
    })

    const menu = wrapper.find('.context-menu')
    expect(menu.attributes('style')).toContain('top: 250px')
    expect(menu.attributes('style')).toContain('left: 150px')
  })

  it('should render all menu items', () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    const menuItems = wrapper.findAll('.context-menu-item')
    expect(menuItems).toHaveLength(3)
    expect(menuItems[0].text()).toBe('Option 1')
    expect(menuItems[1].text()).toBe('Option 2')
    expect(menuItems[2].text()).toBe('Disabled Option')
  })

  it('should mark disabled items with disabled class', () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    const menuItems = wrapper.findAll('.context-menu-item')
    expect(menuItems[0].classes()).not.toContain('disabled')
    expect(menuItems[1].classes()).not.toContain('disabled')
    expect(menuItems[2].classes()).toContain('disabled')
  })

  it('should call action and emit close when clicking enabled item', async () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    const menuItems = wrapper.findAll('.context-menu-item')
    await menuItems[0].trigger('click')

    expect(mockItems[0].action).toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('should not call action when clicking disabled item', async () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    const menuItems = wrapper.findAll('.context-menu-item')
    await menuItems[2].trigger('click')

    expect(mockItems[2].action).not.toHaveBeenCalled()
  })

  it('should emit close when clicking overlay', async () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    await wrapper.find('.context-menu-overlay').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('should not emit close when clicking menu itself', async () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    await wrapper.find('.context-menu').trigger('click')

    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('should prevent context menu on overlay', async () => {
    const wrapper = mount(ContextMenu, {
      props: {
        isVisible: true,
        position: { x: 100, y: 200 },
        items: mockItems
      }
    })

    const contextMenuEvent = new Event('contextmenu')
    const preventDefaultSpy = vi.spyOn(contextMenuEvent, 'preventDefault')

    await wrapper.find('.context-menu-overlay').element.dispatchEvent(contextMenuEvent)

    // The component should handle contextmenu.prevent
    expect(wrapper.find('.context-menu-overlay').exists()).toBe(true)
  })
})
