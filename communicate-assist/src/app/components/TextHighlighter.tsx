'use client';

import { useState, useRef, useEffect } from 'react';

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

export default function TextHighlighter() {
  const [inputText, setInputText] = useState('');
  const [comparisonText, setComparisonText] = useState('example');
  const [isFocused, setIsFocused] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isComposing, setIsComposing] = useState(false); // Track IME composition state
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: '' });
  const inputRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // This function checks if parts of the input match the comparison text
  // and returns an array of segments with information about whether they should be underlined
  const getHighlightedSegments = () => {
    if (!inputText) return [{ text: '', highlight: false }];
    
    // Case-insensitive search for the comparison text within input
    const lowerInput = inputText.toLowerCase();
    const lowerComparison = comparisonText.toLowerCase();
    
    const segments = [];
    let currentIndex = 0;
    
    // Find all occurrences of the comparison text in the input
    let matchIndex = lowerInput.indexOf(lowerComparison);
    while (matchIndex !== -1 && currentIndex <= inputText.length) {
      // Add non-matching segment before match (if any)
      if (matchIndex > currentIndex) {
        segments.push({
          text: inputText.substring(currentIndex, matchIndex),
          highlight: false
        });
      }
      
      // Add matching segment
      segments.push({
        text: inputText.substring(matchIndex, matchIndex + lowerComparison.length),
        highlight: true
      });
      
      // Move current index past this match
      currentIndex = matchIndex + lowerComparison.length;
      
      // Find next match
      matchIndex = lowerInput.indexOf(lowerComparison, currentIndex);
    }
    
    // Add remaining text after last match (if any)
    if (currentIndex < inputText.length) {
      segments.push({
        text: inputText.substring(currentIndex),
        highlight: false
      });
    }
    
    return segments;
  };

  const handleComparisonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setComparisonText(e.target.value);
  };

  // Save current cursor position before updating content
  const saveCursorPosition = () => {
    if (inputRef.current && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (inputRef.current.contains(range.startContainer)) {
          // Calculate the cursor position by measuring text content up to cursor
          let currentNode = inputRef.current.firstChild;
          let totalLength = 0;
          let cursorFound = false;
          
          while (currentNode && !cursorFound) {
            if (currentNode === range.startContainer) {
              totalLength += range.startOffset;
              cursorFound = true;
            } else if (currentNode.nodeType === Node.TEXT_NODE) {
              totalLength += currentNode.textContent?.length || 0;
            } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.childNodes.length > 0) {
              // For element nodes with children, go through each child
              let childNode = currentNode.firstChild;
              while (childNode) {
                if (childNode === range.startContainer) {
                  totalLength += range.startOffset;
                  cursorFound = true;
                  break;
                } else if (childNode.nodeType === Node.TEXT_NODE) {
                  totalLength += childNode.textContent?.length || 0;
                }
                childNode = childNode.nextSibling;
              }
              if (cursorFound) break;
            }
            currentNode = currentNode.nextSibling;
          }
          
          setCursorPosition(totalLength);
        }
      }
    }
  };

  // Handle text input changes in the contentEditable div
  const handleInputChange = () => {
    // Don't process input during IME composition
    if (isComposing) return;
    
    if (inputRef.current) {
      saveCursorPosition();
      setInputText(inputRef.current.textContent || '');
    }
  };

  // IME composition event handlers
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
    // Process the final composition result
    if (inputRef.current) {
      saveCursorPosition();
      setInputText(inputRef.current.textContent || '');
    }
  };

  // Set cursor position to a specific offset from the start
  const setCursorToPosition = (position: number) => {
    if (!inputRef.current || !isFocused || isComposing) return;
    
    try {
      const selection = window.getSelection();
      if (!selection) return;
      
      const range = document.createRange();
      let currentNode = inputRef.current.firstChild;
      let currentPos = 0;
      
      // Edge case: empty or no content
      if (!currentNode) {
        // Create an empty text node
        const textNode = document.createTextNode('');
        inputRef.current.appendChild(textNode);
        range.setStart(textNode, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      
      // Navigate through nodes to find position
      let foundPosition = false;
      while (currentNode && !foundPosition) {
        // Handle text nodes
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const nodeLength = currentNode.textContent?.length || 0;
          
          if (currentPos + nodeLength >= position) {
            // Found the node where the cursor should be
            const offset = position - currentPos;
            range.setStart(currentNode, Math.min(offset, nodeLength));
            range.collapse(true);
            foundPosition = true;
          } else {
            currentPos += nodeLength;
          }
        }
        
        // Move to next node if not found
        if (!foundPosition && currentNode.nextSibling) {
          currentNode = currentNode.nextSibling;
        } else if (!foundPosition) {
          // If reached the end, set to last position
          const lastNode = findLastTextNode(inputRef.current);
          if (lastNode) {
            range.setStart(lastNode, lastNode.textContent?.length || 0);
            range.collapse(true);
          } else {
            // Fallback to element itself if no text nodes
            range.setStart(inputRef.current, 0);
            range.collapse(true);
          }
          foundPosition = true;
        }
      }
      
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      console.error("Error setting cursor position:", error);
      
      // Fallback: set cursor at the end
      try {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          const lastNode = findLastTextNode(inputRef.current);
          
          if (lastNode) {
            range.selectNodeContents(lastNode);
            range.collapse(false); // collapse to end
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch (fallbackError) {
        console.error("Fallback cursor positioning failed:", fallbackError);
      }
    }
  };
  
  // Helper function to find the last text node in an element
  const findLastTextNode = (element: Node | null): Node | null => {
    if (!element) return null;
    
    if (element.nodeType === Node.TEXT_NODE) {
      return element;
    }
    
    let lastTextNode = null;
    let node = element.lastChild;
    
    while (node && !lastTextNode) {
      lastTextNode = findLastTextNode(node);
      node = node.previousSibling;
    }
    
    return lastTextNode;
  };

  // Handle document-wide mousemove to check if mouse is over highlighted span
  const handleDocumentMouseMove = (e: MouseEvent) => {
    if (!inputRef.current || isComposing) return;

    // Get all highlighted spans
    const highlightedSpans = inputRef.current.querySelectorAll('span[data-highlighted="true"]');
    
    let foundSpan = null;
    for (const span of highlightedSpans) {
      const rect = span.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        foundSpan = span;
        break;
      }
    }

    // Clear any existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    if (foundSpan) {
      const rect = foundSpan.getBoundingClientRect();
      // Use a small delay to avoid flickering
      tooltipTimeoutRef.current = setTimeout(() => {
        setTooltip({
          visible: true,
          x: rect.left + window.scrollX + rect.width / 2,
          y: rect.top + window.scrollY + 17,
          text: `"${foundSpan.textContent}" この文章だとどのような意図で他の2団体を並べたかという観点で曖昧なので、他の2団体の並びについては考慮していない旨を書くほうがいいかと思われます。"`
        });
      }, 100);
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  };

  // Add document-wide mouse tracking
  useEffect(() => {
    document.addEventListener('mousemove', handleDocumentMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      // Clear any existing timeout on unmount
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, [comparisonText, isComposing]);

  // Update the contentEditable div when inputText changes
  useEffect(() => {
    // Skip updating during IME composition
    if (isComposing) return;
    
    if (inputRef.current) {
      // If there's no text and not focused, don't update the DOM
      if (!inputText && !isFocused) {
        return;
      }
      
      // Store current cursor position
      const pos = cursorPosition;
      
      // Clear the current content
      inputRef.current.innerHTML = '';
      
      // Add the styled segments
      const segments = getHighlightedSegments();
      segments.forEach(segment => {
        const span = document.createElement('span');
        span.textContent = segment.text;
        
        if (segment.highlight) {
          span.style.textDecoration = 'underline';
          span.style.textDecorationColor = 'red';
          span.style.textDecorationThickness = '2px';
          span.style.cursor = 'help';
          span.dataset.highlighted = 'true'; // Add a data attribute to identify highlighted spans
        }
        
        inputRef.current?.appendChild(span);
      });
      
      // Restore cursor position
      if (isFocused && !isComposing) {
        setTimeout(() => {
          setCursorToPosition(pos);
        }, 0);
      }
    }
  }, [inputText, comparisonText, isFocused, isComposing]);

  const handleFocus = () => {
    setIsFocused(true);
    
    // Clear placeholder if it exists
    if (inputRef.current && !inputText) {
      inputRef.current.innerHTML = '';
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    // Show placeholder if there's no text
    if (inputRef.current && !inputText) {
      inputRef.current.innerHTML = '<span class="text-gray-400">Type something...</span>';
    }
  };

  // Set initial placeholder
  useEffect(() => {
    if (inputRef.current && !inputText && !isFocused) {
      inputRef.current.innerHTML = '<span class="text-gray-400">Type something...</span>';
    }
  }, []);
  
  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="mb-4">
        <label htmlFor="comparison-text" className="block text-sm font-medium mb-2">
          Text to match:
        </label>
        <input
          id="comparison-text"
          type="text"
          value={comparisonText}
          onChange={handleComparisonChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Enter text to match..."
        />
      </div>
      
      <div className="mb-4 relative">
        <label htmlFor="custom-input" className="block text-sm font-medium mb-2">
          Enter your text:
        </label>
        <div
          ref={inputRef}
          id="custom-input"
          contentEditable
          onInput={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[40px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{ 
            whiteSpace: 'pre-wrap', 
            wordBreak: 'break-word',
            cursor: 'text',
            backgroundColor: 'white'
          }}
          suppressContentEditableWarning
        />
        
        {/* Tooltip - Positioned relative to document */}
        {tooltip.visible && (
          <div
            className="fixed z-50 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm shadow-lg"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y - 10}px`, // Position above with offset
              transform: 'translate(-50%, -100%)', // Center horizontally and move up
              maxWidth: '250px',
              pointerEvents: 'none',
            }}
          >
            <p>{tooltip.text}</p>
            {/* Arrow pointing down */}
            <div 
              className="absolute w-3 h-3 bg-gray-800 transform rotate-45"
              style={{
                bottom: '-6px',
                left: '50%',
                marginLeft: '-6px',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
} 
