import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'

describe('ConfirmDeleteDialog', () => {
  it('should render dialog when open', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    expect(wrapper.find('.base-modal-overlay').exists()).toBe(true)
    expect(wrapper.find('.base-modal').exists()).toBe(true)
  })

  it('should not render dialog when closed', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: false,
        rowCount: 3
      }
    })

    expect(wrapper.find('.base-modal-overlay').exists()).toBe(false)
    expect(wrapper.find('.base-modal').exists()).toBe(false)
  })

  it('should display correct title', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 5
      }
    })

    expect(wrapper.find('h2').text()).toBe('Delete Selected Rows')
  })

  it('should display row count with singular form', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 1
      }
    })

    expect(wrapper.find('.warning-box').text()).toContain('1 row')
    expect(wrapper.find('.warning-box').text()).not.toContain('rows')
  })

  it('should display row count with plural form', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 5
      }
    })

    expect(wrapper.find('.warning-box').text()).toContain('5 rows')
  })

  it('should display warning message', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    const warningText = wrapper.find('.warning-box').text()
    expect(warningText).toContain('Are you sure you want to delete')
    expect(warningText).toContain('This action cannot be undone')
  })

  it('should have Cancel button', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    const cancelButton = wrapper.find('.dialog-button-secondary')
    expect(cancelButton.exists()).toBe(true)
    expect(cancelButton.text()).toBe('Cancel')
  })

  it('should have Delete button', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    const deleteButton = wrapper.find('.dialog-button-danger')
    expect(deleteButton.exists()).toBe(true)
    expect(deleteButton.text()).toBe('Delete')
  })

  it('should emit close when clicking Cancel', async () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    await wrapper.find('.dialog-button-secondary').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('should emit confirm and close when clicking Delete', async () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    await wrapper.find('.dialog-button-danger').trigger('click')

    expect(wrapper.emitted('confirm')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('should emit close when clicking overlay', async () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    await wrapper.find('.base-modal-overlay').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('should not emit close when clicking dialog box', async () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    await wrapper.find('.base-modal').trigger('click')

    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('should have warning styling on message', () => {
    const wrapper = mount(ConfirmDeleteDialog, {
      props: {
        isOpen: true,
        rowCount: 3
      }
    })

    const warningText = wrapper.find('.warning-box')
    expect(warningText.exists()).toBe(true)
    // Check that warning class is applied (for styling)
    expect(warningText.classes()).toContain('warning-box')
  })
})
