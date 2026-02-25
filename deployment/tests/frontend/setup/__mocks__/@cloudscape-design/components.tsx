/**
 * @fileoverview Mock implementations for CloudScape Design System components.
 * 
 * Provides simple mock implementations for testing purposes.
 */

import React from 'react';

// Mock Box component
export const Box = ({ children, ...props }: any) => {
  // Filter out CloudScape-specific props that shouldn't be passed to DOM
  const {
    margin,
    textAlign,
    variant,
    fontSize,
    color,
    padding,
    float,
    ...otherProps
  } = props;

  return React.createElement('div', {
    'data-testid': 'cloudscape-box',
    style: {
      textAlign,
      fontSize,
      color,
      float
    },
    ...otherProps
  }, children);
};

// Mock Badge component
export const Badge = ({ children, color, ...props }: any) => 
  React.createElement('span', {
    'data-testid': 'cloudscape-badge',
    'data-color': color,
    ...props
  }, children);

// Mock StatusIndicator component
export const StatusIndicator = ({ children, type, ...props }: any) => 
  React.createElement('div', {
    'data-testid': 'cloudscape-status-indicator',
    'data-type': type,
    ...props
  }, children);

// Mock SpaceBetween component
export const SpaceBetween = ({ children, direction, size, alignItems, ...props }: any) => {
  // Filter out CloudScape-specific props
  const { ...otherProps } = props;

  return React.createElement('div', {
    'data-testid': 'cloudscape-space-between',
    'data-direction': direction,
    'data-size': size,
    'data-align-items': alignItems,
    style: {
      display: 'flex',
      flexDirection: direction === 'vertical' ? 'column' : 'row',
      alignItems: alignItems,
      gap: size === 'xs' ? '4px' : size === 's' ? '8px' : size === 'm' ? '16px' : size === 'l' ? '24px' : '16px'
    },
    ...otherProps
  }, children);
};

// Mock FormField component
export const FormField = ({ children, label, errorText, constraintText, ...props }: any) => {
  const fieldId = `field-${Math.random().toString(36).substr(2, 9)}`;
  
  return React.createElement('div', {
    'data-testid': 'cloudscape-form-field',
    errortext: errorText || '',
    constrainttext: constraintText || '',
    ...props
  }, [
    label && React.createElement('label', { 
      key: 'label',
      htmlFor: fieldId
    }, label),
    React.cloneElement(children, { key: 'input', id: fieldId, ...children.props }),
    errorText && React.createElement('div', {
      key: 'error',
      'data-testid': 'form-field-error',
      style: { color: 'red', fontSize: '12px', marginTop: '4px' }
    }, errorText)
  ].filter(Boolean));
};

// Mock Multiselect component
export const Multiselect = ({
  selectedOptions,
  onChange,
  options,
  placeholder,
  selectedAriaLabel,
  ariaLabel,
  ...props
}: any) => {
  const handleOptionClick = (option: any) => {
    const isSelected = selectedOptions.some((selected: any) => selected.value === option.value);
    let newSelectedOptions;

    if (isSelected) {
      // Remove option
      newSelectedOptions = selectedOptions.filter((selected: any) => selected.value !== option.value);
    } else {
      // Add option
      newSelectedOptions = [...selectedOptions, option];
    }

    onChange({ detail: { selectedOptions: newSelectedOptions } });
  };

  return React.createElement('div', {
    'data-testid': 'cloudscape-multiselect',
    'aria-label': ariaLabel,
    ...props
  }, options.map((option: any) => {
    const isSelected = selectedOptions.some((selected: any) => selected.value === option.value);
    return React.createElement('div', {
      key: option.value,
      onClick: () => handleOptionClick(option),
      style: {
        cursor: 'pointer',
        padding: '4px',
        backgroundColor: isSelected ? '#e3f2fd' : 'transparent'
      },
      'data-testid': `multiselect-option-${option.value}`
    }, option.label);
  }));
};

// Mock Button component
export const Button = ({ children, onClick, variant, ariaLabel, loading, disabled, loadingText, formAction, ...props }: any) => 
  React.createElement('button', {
    'data-testid': 'cloudscape-button',
    'data-variant': variant,
    onClick: onClick,
    'aria-label': ariaLabel,
    disabled: disabled || loading,
    loadingtext: loadingText,
    type: formAction === 'submit' ? 'submit' : 'button',
    ...props
  }, loading && loadingText ? loadingText : children);

// Mock Alert component
export const Alert = ({ children, type, header, statusIconAriaLabel, dismissible, onDismiss, ...props }: any) => {
  // Filter out CloudScape-specific props that shouldn't be passed to DOM
  const { ...domProps } = props;

  return React.createElement('div', {
    'data-testid': 'cloudscape-alert',
    'data-type': type,
    ...domProps
  }, [
    header && React.createElement('div', { 
      key: 'header',
      'data-testid': 'alert-header' 
    }, header),
    React.createElement('div', { key: 'content' }, children),
    dismissible && React.createElement('button', {
      key: 'dismiss',
      onClick: onDismiss,
      'data-testid': 'alert-dismiss',
      style: { float: 'right', marginTop: '-20px' }
    }, '×')
  ].filter(Boolean));
};

// Mock Spinner component
export const Spinner = ({ size, ...props }: any) => 
  React.createElement('div', {
    'data-testid': 'cloudscape-spinner',
    'data-size': size,
    ...props
  }, 'Loading...');

// Mock Input component
export const Input = ({
  value,
  onChange,
  placeholder,
  type,
  disabled,
  ariaLabel,
  clearAriaLabel,
  onKeyDown,
  ariaDescribedby,
  autoComplete,
  autoFocus,
  ...props
}: any) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange({ detail: { value: e.target.value } });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      onKeyDown({ detail: { key: e.key } });
    }
  };

  const inputProps: any = {
    'data-testid': 'cloudscape-input',
    type: type || 'text',
    role: type === 'search' ? 'searchbox' : undefined,
    value: value || '',
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    placeholder: placeholder,
    disabled: disabled,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedby,
    autoComplete: autoComplete,
    ...props
  };

  // Handle autoFocus as a boolean attribute
  if (autoFocus) {
    inputProps.autoFocus = true;
  }

  return React.createElement('input', inputProps);
};

// Mock Modal component
export const Modal = ({
  children,
  visible,
  onDismiss,
  header,
  footer,
  closeAriaLabel,
  size,
  ...props
}: any) => {
  if (!visible) return null;

  return React.createElement('div', {
    'data-testid': 'cloudscape-modal',
    'data-size': size,
    role: 'dialog',
    'aria-modal': 'true',
    ...props
  }, [
    React.createElement('div', {
      key: 'header',
      'data-testid': 'modal-header'
    }, [
      React.createElement('span', { key: 'header-content' }, header),
      React.createElement('button', {
        key: 'close-btn',
        'data-testid': 'modal-close-button',
        onClick: onDismiss,
        'aria-label': closeAriaLabel
      }, '×')
    ]),
    React.createElement('div', {
      key: 'content',
      'data-testid': 'modal-content'
    }, children),
    footer && React.createElement('div', {
      key: 'footer',
      'data-testid': 'modal-footer'
    }, footer)
  ].filter(Boolean));
};

// Mock Header component
export const Header = ({
  children,
  variant,
  description,
  actions,
  ...props
}: any) => {
  const tagName = variant === 'h1' ? 'h1' : variant === 'h2' ? 'h2' : variant === 'h3' ? 'h3' : 'div';

  return React.createElement('div', {
    'data-testid': 'cloudscape-header',
    ...props
  }, [
    React.createElement(tagName, {
      key: 'heading',
      'data-testid': `header-${variant || 'default'}`
    }, children),
    description && React.createElement('div', {
      key: 'description',
      'data-testid': 'header-description'
    }, description),
    actions && React.createElement('div', {
      key: 'actions',
      'data-testid': 'header-actions'
    }, actions)
  ].filter(Boolean));
};

// Mock Container component
export const Container = ({
  children,
  header,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-container',
  ...props
}, [
  header && React.createElement('div', {
    key: 'header',
    'data-testid': 'container-header'
  }, header),
  React.createElement('div', {
    key: 'content',
    'data-testid': 'container-content'
  }, children)
].filter(Boolean));

// Mock ColumnLayout component
export const ColumnLayout = ({
  children,
  columns,
  variant,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-column-layout',
  'data-columns': columns,
  'data-variant': variant,
  style: {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns || 1}, 1fr)`,
    gap: '16px'
  },
  ...props
}, children);

// Mock Icon component
export const Icon = ({
  name,
  size,
  alt,
  ...props
}: any) => React.createElement('span', {
  'data-testid': 'cloudscape-icon',
  'data-name': name,
  'data-size': size,
  'aria-label': alt,
  ...props
}, `[${name}]`);

// Mock Cards component
export const Cards = ({
  items,
  cardDefinition,
  cardsPerRow,
  selectionType,
  selectedItems,
  onSelectionChange,
  trackBy,
  variant,
  stickyHeader,
  empty,
  ariaLabels,
  ...props
}: any) => {
  const handleItemClick = (item: any) => {
    if (selectionType === 'single' && onSelectionChange) {
      onSelectionChange({ detail: { selectedItems: [item] } });
    }
  };

  if (!items || items.length === 0) {
    return React.createElement('div', {
      'data-testid': 'cloudscape-cards-empty',
      ...props
    }, empty);
  }

  return React.createElement('div', {
    'data-testid': 'cloudscape-cards',
    'data-variant': variant,
    ...props
  }, items.map((item: any, index: number) => {
    const isSelected = selectedItems && selectedItems.some((selected: any) => 
      selected[trackBy] === item[trackBy]
    );

    return React.createElement('div', {
      key: item[trackBy] || index,
      'data-testid': `card-${item[trackBy] || index}`,
      role: selectionType ? 'button' : undefined,
      tabIndex: selectionType ? 0 : undefined,
      onClick: () => handleItemClick(item),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleItemClick(item);
        }
      },
      'aria-selected': isSelected,
      style: {
        border: isSelected ? '2px solid blue' : '1px solid gray',
        padding: '16px',
        margin: '8px',
        cursor: selectionType ? 'pointer' : 'default',
        borderRadius: '4px'
      }
    }, [
      cardDefinition.header && React.createElement('div', {
        key: 'header',
        'data-testid': 'card-header'
      }, cardDefinition.header(item)),
      cardDefinition.sections && cardDefinition.sections.map((section: any, sectionIndex: number) => 
        React.createElement('div', {
          key: section.id || sectionIndex,
          'data-testid': `card-section-${section.id || sectionIndex}`
        }, section.content(item))
      )
    ].filter(Boolean));
  }));

};

// Mock Tiles component
export const Tiles = ({
  items,
  renderItem,
  columns,
  ariaLabels,
  ...props
}: any) => {
  return React.createElement('div', {
    'data-testid': 'cloudscape-tiles',
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns || 4}, 1fr)`,
      gap: '16px'
    },
    ...props
  }, items.map((item: any, index: number) => 
    React.createElement('div', {
      key: index,
      'data-testid': `tile-${index}`
    }, renderItem(item))
  ));
};

// Mock BreadcrumbGroup component
export const BreadcrumbGroup = ({
  items,
  ariaLabel,
  ...props
}: any) => React.createElement('nav', {
  'data-testid': 'cloudscape-breadcrumb-group',
  'aria-label': ariaLabel,
  ...props
}, items.map((item: any, index: number) => [
  React.createElement('a', {
    key: `item-${index}`,
    href: item.href,
    'data-testid': `breadcrumb-${index}`
  }, item.text),
  index < items.length - 1 && React.createElement('span', {
    key: `separator-${index}`,
    'data-testid': `breadcrumb-separator-${index}`
  }, ' > ')
]).flat().filter(Boolean));

// Mock Flashbar component
export const Flashbar = ({
  items,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-flashbar',
  ...props
}, items.map((item: any, index: number) => 
  React.createElement('div', {
    key: item.id || index,
    'data-testid': `flashbar-item-${item.id || index}`,
    'data-type': item.type,
    style: {
      padding: '12px',
      margin: '4px 0',
      border: '1px solid #ccc',
      borderRadius: '4px',
      backgroundColor: item.type === 'error' ? '#ffebee' : 
                      item.type === 'warning' ? '#fff3e0' :
                      item.type === 'success' ? '#e8f5e8' : '#e3f2fd'
    }
  }, [
    item.header && React.createElement('div', {
      key: 'header',
      style: { fontWeight: 'bold', marginBottom: '4px' }
    }, item.header),
    React.createElement('div', { key: 'content' }, item.content),
    item.dismissible && React.createElement('button', {
      key: 'dismiss',
      onClick: item.onDismiss,
      style: { float: 'right', marginTop: '-20px' }
    }, '×')
  ].filter(Boolean))
));

// Mock Grid component
export const Grid = ({
  children,
  gridDefinition,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-grid',
  style: {
    display: 'grid',
    gridTemplateColumns: gridDefinition.map((def: any) => 
      `${def.colspan || 1}fr`
    ).join(' '),
    gap: '16px'
  },
  ...props
}, children);

// Mock Form component
export const Form = ({
  children,
  actions,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-form',
  ...props
}, [
  children,
  actions && React.createElement('div', {
    key: 'actions',
    'data-testid': 'form-actions'
  }, actions)
].filter(Boolean));

// Mock Link component
export const Link = ({
  children,
  onFollow,
  href,
  variant,
  fontSize,
  ...props
}: any) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onFollow) {
      onFollow();
    }
  };

  return React.createElement('a', {
    'data-testid': 'cloudscape-link',
    'data-variant': variant,
    'data-font-size': fontSize,
    href: href || '#',
    onClick: handleClick,
    style: {
      color: '#0073bb',
      textDecoration: 'underline',
      cursor: 'pointer',
      fontSize: fontSize === 'body-s' ? '14px' : undefined
    },
    ...props
  }, children);
};

// Mock ProgressBar component
export const ProgressBar = ({
  value,
  additionalInfo,
  description,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-progress-bar',
  ...props
}, [
  React.createElement('div', {
    key: 'bar',
    style: {
      width: '100%',
      height: '8px',
      backgroundColor: '#e0e0e0',
      borderRadius: '4px',
      overflow: 'hidden'
    }
  }, React.createElement('div', {
    style: {
      width: `${value}%`,
      height: '100%',
      backgroundColor: '#0073bb',
      transition: 'width 0.3s ease'
    }
  })),
  additionalInfo && React.createElement('div', {
    key: 'info',
    'data-testid': 'progress-bar-info',
    style: { fontSize: '12px', marginTop: '4px' }
  }, additionalInfo),
  description && React.createElement('div', {
    key: 'description',
    'data-testid': 'progress-bar-description',
    style: { fontSize: '12px', color: '#666', marginTop: '2px' }
  }, description)
].filter(Boolean));

// Mock KeyValuePairs component
export const KeyValuePairs = ({
  items,
  columns,
  ...props
}: any) => React.createElement('div', {
  'data-testid': 'cloudscape-key-value-pairs',
  'data-columns': columns,
  style: {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns || 1}, 1fr)`,
    gap: '16px'
  },
  ...props
}, items.map((item: any, index: number) => 
  React.createElement('div', {
    key: index,
    'data-testid': `key-value-pair-${index}`
  }, [
    React.createElement('div', {
      key: 'label',
      'data-testid': `key-value-label-${index}`,
      style: { fontWeight: 'bold', marginBottom: '4px' }
    }, item.label),
    React.createElement('div', {
      key: 'value',
      'data-testid': `key-value-value-${index}`
    }, item.value)
  ])
));

// Mock ExpandableSection component
export const ExpandableSection = ({
  children,
  headerText,
  headerDescription,
  expanded,
  onChange,
  ...props
}: any) => {
  const handleToggle = () => {
    if (onChange) {
      onChange({ detail: { expanded: !expanded } });
    }
  };

  return React.createElement('div', {
    'data-testid': 'cloudscape-expandable-section',
    'data-expanded': expanded,
    ...props
  }, [
    React.createElement('div', {
      key: 'header',
      'data-testid': 'expandable-section-header',
      onClick: handleToggle,
      style: {
        cursor: 'pointer',
        padding: '12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        backgroundColor: '#f5f5f5'
      }
    }, [
      React.createElement('div', {
        key: 'text',
        style: { fontWeight: 'bold' }
      }, headerText),
      headerDescription && React.createElement('div', {
        key: 'description',
        style: { fontSize: '14px', color: '#666', marginTop: '4px' }
      }, headerDescription)
    ].filter(Boolean)),
    expanded && React.createElement('div', {
      key: 'content',
      'data-testid': 'expandable-section-content',
      style: {
        padding: '16px',
        border: '1px solid #ccc',
        borderTop: 'none',
        borderRadius: '0 0 4px 4px'
      }
    }, children)
  ].filter(Boolean));
};

// Mock Tabs component
export const Tabs = ({
  tabs,
  activeTabId,
  onChange,
  ...props
}: any) => {
  const handleTabClick = (tabId: string) => {
    if (onChange) {
      onChange({ detail: { activeTabId: tabId } });
    }
  };

  const activeTab = tabs.find((tab: any) => tab.id === activeTabId);

  return React.createElement('div', {
    'data-testid': 'cloudscape-tabs',
    ...props
  }, [
    React.createElement('div', {
      key: 'tab-headers',
      'data-testid': 'tabs-headers',
      style: {
        display: 'flex',
        borderBottom: '1px solid #ccc'
      }
    }, tabs.map((tab: any) => 
      React.createElement('button', {
        key: tab.id,
        'data-testid': `tab-header-${tab.id}`,
        onClick: () => handleTabClick(tab.id),
        style: {
          padding: '12px 16px',
          border: 'none',
          backgroundColor: tab.id === activeTabId ? '#e3f2fd' : 'transparent',
          borderBottom: tab.id === activeTabId ? '2px solid #0073bb' : '2px solid transparent',
          cursor: 'pointer'
        }
      }, tab.label)
    )),
    activeTab && React.createElement('div', {
      key: 'tab-content',
      'data-testid': `tab-content-${activeTabId}`,
      style: { padding: '16px' }
    }, activeTab.content)
  ].filter(Boolean));
};