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
  const [isComposing, setIsComposing] = useState(false); // IMEの入力状態を追跡
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: '' });
  const inputRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // この関数は、入力テキストの一部が比較テキストと一致するかどうかをチェックし、
  // 下線を引くべきかどうかの情報を持つセグメントの配列を返します
  const getHighlightedSegments = () => {
    if (!inputText) return [{ text: '', highlight: false }];
    
    // 入力テキスト内で比較テキストを大文字/小文字を区別せずに検索
    const lowerInput = inputText.toLowerCase();
    const lowerComparison = comparisonText.toLowerCase();
    
    const segments = [];
    let currentIndex = 0;
    
    // 入力内の比較テキストのすべての出現箇所を見つける
    let matchIndex = lowerInput.indexOf(lowerComparison);
    while (matchIndex !== -1 && currentIndex <= inputText.length) {
      // 一致する前の非一致セグメントを追加（もしあれば）
      if (matchIndex > currentIndex) {
        segments.push({
          text: inputText.substring(currentIndex, matchIndex),
          highlight: false
        });
      }
      
      // 一致するセグメントを追加
      segments.push({
        text: inputText.substring(matchIndex, matchIndex + lowerComparison.length),
        highlight: true
      });
      
      // 現在のインデックスをこの一致を超えて移動
      currentIndex = matchIndex + lowerComparison.length;
      
      // 次の一致を見つける
      matchIndex = lowerInput.indexOf(lowerComparison, currentIndex);
    }
    
    // 最後の一致の後の残りのテキストを追加（もしあれば）
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

  // コンテンツを更新する前に現在のカーソル位置を保存
  const saveCursorPosition = () => {
    if (inputRef.current && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (inputRef.current.contains(range.startContainer)) {
          // カーソルまでのテキスト内容を測定してカーソル位置を計算
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
              // 子要素を持つ要素ノードの場合、各子要素を調べる
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

  // contentEditableのdivのテキスト入力変更を処理
  const handleInputChange = () => {
    // IME入力中は処理しない
    if (isComposing) return;
    
    if (inputRef.current) {
      saveCursorPosition();
      setInputText(inputRef.current.textContent || '');
    }
  };

  // IMEコンポジションイベントハンドラ
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
    // 最終的な入力結果を処理
    if (inputRef.current) {
      saveCursorPosition();
      setInputText(inputRef.current.textContent || '');
    }
  };

  // 特定のオフセットからカーソル位置を設定
  const setCursorToPosition = (position: number) => {
    if (!inputRef.current || !isFocused || isComposing) return;
    
    try {
      const selection = window.getSelection();
      if (!selection) return;
      
      const range = document.createRange();
      let currentNode = inputRef.current.firstChild;
      let currentPos = 0;
      
      // エッジケース：空または内容なし
      if (!currentNode) {
        // 空のテキストノードを作成
        const textNode = document.createTextNode('');
        inputRef.current.appendChild(textNode);
        range.setStart(textNode, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      
      // 位置を見つけるためにノードを巡回
      let foundPosition = false;
      while (currentNode && !foundPosition) {
        // テキストノードを処理
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const nodeLength = currentNode.textContent?.length || 0;
          
          if (currentPos + nodeLength >= position) {
            // カーソルを置くべきノードが見つかった
            const offset = position - currentPos;
            range.setStart(currentNode, Math.min(offset, nodeLength));
            range.collapse(true);
            foundPosition = true;
          } else {
            currentPos += nodeLength;
          }
        }
        
        // 見つからなかった場合は次のノードに移動
        if (!foundPosition && currentNode.nextSibling) {
          currentNode = currentNode.nextSibling;
        } else if (!foundPosition) {
          // 終わりに達した場合、最後の位置に設定
          const lastNode = findLastTextNode(inputRef.current);
          if (lastNode) {
            range.setStart(lastNode, lastNode.textContent?.length || 0);
            range.collapse(true);
          } else {
            // テキストノードがない場合は要素自体にフォールバック
            range.setStart(inputRef.current, 0);
            range.collapse(true);
          }
          foundPosition = true;
        }
      }
      
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      console.error("カーソル位置の設定中にエラーが発生しました:", error);
      
      // フォールバック：カーソルを最後に設定
      try {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          const lastNode = findLastTextNode(inputRef.current);
          
          if (lastNode) {
            range.selectNodeContents(lastNode);
            range.collapse(false); // 末尾に折りたたむ
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch (fallbackError) {
        console.error("フォールバックカーソル位置決めに失敗しました:", fallbackError);
      }
    }
  };
  
  // 要素内の最後のテキストノードを見つけるヘルパー関数
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

  // マウスがハイライトされたスパンの上にあるかをチェックするドキュメント全体のマウス移動を処理
  const handleDocumentMouseMove = (e: MouseEvent) => {
    if (!inputRef.current || isComposing) return;

    // ハイライトされたすべてのスパンを取得
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

    // 既存のタイムアウトをクリア
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }

    if (foundSpan) {
      const rect = foundSpan.getBoundingClientRect();
      // ちらつきを避けるために小さな遅延を使用
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

  // ドキュメント全体のマウストラッキングを追加
  useEffect(() => {
    document.addEventListener('mousemove', handleDocumentMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      // アンマウント時に既存のタイムアウトをクリア
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, [comparisonText, isComposing]);

  // inputTextが変更されたときにcontentEditableのdivを更新
  useEffect(() => {
    // IME入力中はスキップ
    if (isComposing) return;
    
    if (inputRef.current) {
      // テキストがなく、フォーカスもない場合はDOMを更新しない
      if (!inputText && !isFocused) {
        return;
      }
      
      // 現在のカーソル位置を保存
      const pos = cursorPosition;
      
      // 現在の内容をクリア
      inputRef.current.innerHTML = '';
      
      // スタイル付きのセグメントを追加
      const segments = getHighlightedSegments();
      segments.forEach(segment => {
        const span = document.createElement('span');
        span.textContent = segment.text;
        
        if (segment.highlight) {
          span.style.textDecoration = 'underline';
          span.style.textDecorationColor = 'red';
          span.style.textDecorationThickness = '2px';
          span.style.cursor = 'help';
          span.dataset.highlighted = 'true'; // ハイライトされたスパンを識別するためのデータ属性を追加
        }
        
        inputRef.current?.appendChild(span);
      });
      
      // カーソル位置を復元
      if (isFocused && !isComposing) {
        setTimeout(() => {
          setCursorToPosition(pos);
        }, 0);
      }
    }
  }, [inputText, comparisonText, isFocused, isComposing]);

  const handleFocus = () => {
    setIsFocused(true);
    
    // プレースホルダーが存在する場合はクリア
    if (inputRef.current && !inputText) {
      inputRef.current.innerHTML = '';
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    // テキストがない場合はプレースホルダーを表示
    if (inputRef.current && !inputText) {
      inputRef.current.innerHTML = '<span class="text-gray-400">Type something...</span>';
    }
  };

  // 初期プレースホルダーを設定
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
        
        {/* ツールチップ - ドキュメントに対して相対的に配置 */}
        {tooltip.visible && (
          <div
            className="fixed z-50 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm shadow-lg"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y - 10}px`, // 上部にオフセットで配置
              transform: 'translate(-50%, -100%)', // 水平方向に中央揃え、上方向に移動
              maxWidth: '250px',
              pointerEvents: 'none',
            }}
          >
            <p>{tooltip.text}</p>
            {/* 下向きの矢印 */}
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
