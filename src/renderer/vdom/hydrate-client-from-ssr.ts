import * as d from '../../declarations';
import { NODE_TYPE, SSR_CHILD_ID, SSR_CONTENT_REF_NODE_COMMENT, SSR_HOST_ID, SSR_LIGHT_DOM_ATTR, SSR_LIGHT_DOM_NODE_COMMENT, SSR_ORIGINAL_LOCATION_NODE_ATTR, SSR_ORIGINAL_LOCATION_NODE_COMMENT, SSR_SHADOW_DOM_HOST_ID, SSR_SLOT_NODE_COMMENT, SSR_TEXT_NODE_COMMENT, SSR_TEXT_NODE_COMMENT_END } from '../../util/constants';


// Welcome SSR Friends!!!

export function hydrateClientFromSsr(plt: d.PlatformApi, domApi: d.DomApi, rootElm: Element) {
  // mark the root element has fully loaded since it was prerendered
  plt.hasLoadedMap.set(rootElm as d.HostElement, true);

  const removeNodes: d.RenderNode[] = [];
  const slottedCmps: d.SlottedComponent[] = [];
  const orgLocationNodes = new Map<string, Text>();


  function addChildNodes(hostTagName: string, hostElm: d.HostElement, node: d.RenderNode, nodeType: number, parentVNode: d.VNode, ssrHostId: string, checkNestedElements: boolean, slottedCmp: d.SlottedComponent) {
    let attrId: string;
    let dataIdSplt: any[];
    let childVNode: d.VNode;

    if (checkNestedElements && nodeType === NODE_TYPE.ElementNode) {
      // we should keep checking for nested element to this component
      // and this node is an element

      // see if this element has a ssr child attribute
      if ((attrId = domApi.$getAttribute(node, SSR_CHILD_ID))) {
        // so apparently this is element is a ssr child node to something
        // split the start comment's data with a period
        dataIdSplt = attrId.split('.');

        // check if this element is a child element of the ssr vnode
        if (dataIdSplt[0] === ssrHostId) {
          // cool, turns out this element is a child to the parent vnode
          childVNode = {
            vtag: domApi.$tagName(node),
            elm: node,
            vattrs: null,
            vchildren: null
          };

          node['s-hn'] = hostTagName;

          // this is a new child vnode
          // so ensure its parent vnode has the vchildren array
          if (!parentVNode.vchildren) {
            parentVNode.vchildren = [];
          }

          // add our child vnode to a specific index of the vnode's children
          parentVNode.vchildren[dataIdSplt[1]] = childVNode;

          // this is now the new parent vnode for all the next child checks
          parentVNode = childVNode;

          // if there's a trailing period, then it means there aren't any
          // more nested elements, but maybe nested text nodes
          // either way, don't keep walking down the tree after this next call
          checkNestedElements = (dataIdSplt[2] !== '');

          // remove the ssr child attribute
          // domApi.$removeAttribute(node, SSR_CHILD_ID);
        }
      }

      if ((attrId = domApi.$getAttribute(node, SSR_ORIGINAL_LOCATION_NODE_ATTR)) && (dataIdSplt = attrId.split('.')) && (dataIdSplt[0] === ssrHostId)) {
        // remove the ssr original location attribute
        domApi.$removeAttribute(node, SSR_ORIGINAL_LOCATION_NODE_ATTR);
      }

      if ((attrId = domApi.$getAttribute(node, SSR_LIGHT_DOM_ATTR)) && (dataIdSplt = attrId.split('.')) && (dataIdSplt[0] === ssrHostId)) {
        // since this is a shadow dom component let's also check to
        // to see if this element is a light dom node that should
        // be relocated to be a direct child of the host component
        // cool, so looks like this element is a light dom that should
        // be relocated to be a direct child of the host component
        slottedCmp.lightDomNodes.push({
          contentIndex: parseInt(dataIdSplt[2], 10),
          elm: node
        });

        // remove the ssr light dom attribute
        // domApi.$removeAttribute(node, SSR_LIGHT_DOM_ATTR);
      }

      // keep drilling down through the elements
      const childNodes = domApi.$childNodes(node) as NodeListOf<d.RenderNode>;
      for (let i = 0; i < childNodes.length; i++) {
        addChildNodes(hostTagName, hostElm, childNodes[i], domApi.$nodeType(childNodes[i]), parentVNode, ssrHostId, checkNestedElements, slottedCmp);
      }

    } else if (__BUILD_CONDITIONALS__.hasSlot && nodeType === NODE_TYPE.CommentNode) {
      // this is a comment node, so it could have ssr data in it
      // split the start comment's data with a period
      dataIdSplt = domApi.$getTextContent(node).split('.');

      if (dataIdSplt[1] === ssrHostId) {
        // cool, so this is a comment node representing some ssr data
        // about a child node of this host element

        if (dataIdSplt[0] === SSR_CONTENT_REF_NODE_COMMENT) {
          // this is a content reference html comment
          (hostElm['s-cr'] = domApi.$createTextNode('') as any)['s-cn'] = true;
          domApi.$insertBefore(hostElm, hostElm['s-cr'], node);
          domApi.$remove(node);

        } else if (dataIdSplt[0] === SSR_ORIGINAL_LOCATION_NODE_COMMENT) {
          // this is a node representing a light dom's original location
          // before it was moved around to the correct slot location
          const orgLocationNode = domApi.$createTextNode('');
          orgLocationNodes.set(ssrHostId.substring(2), orgLocationNode);
          domApi.$insertBefore(hostElm, orgLocationNode, node);
          domApi.$remove(node);

        } else if (dataIdSplt[0] === SSR_SLOT_NODE_COMMENT) {
          // this comment node represents where a real <slot> node should go
          // replace the comment node with an actual <slot>
          childVNode = {
            vtag: 'slot',
            vattrs: null,
            vchildren: null
          };

          if (dataIdSplt[3]) {
            // this slot has a "name" attribute
            // add the "name" to the vnode data
            childVNode.vattrs = childVNode.vattrs || {};
            childVNode.vattrs.name = (childVNode.vname = dataIdSplt[3]);
          }

          if (__BUILD_CONDITIONALS__.hasShadowDom && domApi.$supportsShadowDom) {
            // add the new <slot> element
            childVNode.elm = domApi.$createElement('slot');
            domApi.$insertBefore(parentVNode.elm, childVNode.elm, node);

            if (dataIdSplt[3]) {
              domApi.$setAttribute(childVNode.elm, 'name', dataIdSplt[3]);
            }
          }

          // remove the old html comment node
          // domApi.$remove(node);

          // this is a new child vnode
          // so ensure its parent vnode has the vchildren array
          if (!parentVNode.vchildren) {
            parentVNode.vchildren = [];
          }

          // add our child vnode to a specific index of the vnode's children
          parentVNode.vchildren[dataIdSplt[2]] = childVNode;

        } else if (dataIdSplt[0] === SSR_TEXT_NODE_COMMENT) {
          // this is a comment that could be the node before a text node
          // get the next text node which
          // the comment node may have ssr data about
          node = domApi.$nextSibling(node) as d.RenderNode;
          if (node && domApi.$nodeType(node) === NODE_TYPE.TextNode) {
            // this is an ssr text node starting comment for a vnode
            // create a new vnode about this text node
            childVNode = {
              vtext: domApi.$getTextContent(node),
              elm: node
            };

            node['s-hn'] = hostTagName;

            // this is a new child vnode
            // so ensure its parent vnode has the vchildren array
            if (!parentVNode.vchildren) {
              parentVNode.vchildren = [];
            }

            // add our child vnode to a specific index of the vnode's children
            parentVNode.vchildren[dataIdSplt[2]] = childVNode;

            if

            // this is a start
            // remove this node later on
            removeNodes.push(node);
          }

        } else if (dataIdSplt[0] === SSR_TEXT_NODE_COMMENT_END) {
          // this is a closing text node comment
          // which is no longer needed
          // remove this node later on
          removeNodes.push(node);
        }
      }
    }
  }


  function hydrateElementFromSsr(parentNode: d.RenderNode, childNodes?: NodeListOf<d.RenderNode>, i?: number, node?: d.RenderNode, ssrHostId?: string, ssrVNode?: d.VNode) {
    // get all the child nodes for this element
    // this includes elements, text nodes and comment nodes
    childNodes = domApi.$childNodes(parentNode) as NodeListOf<d.RenderNode>;

    for (i = childNodes.length - 1; i >= 0; i--) {
      node = childNodes[i];

      if (domApi.$nodeType(node) === NODE_TYPE.ElementNode) {
        // this is an element node :)
        // keep drilling down first so we hydrate from bottom up
        // hydrateElementFromSsr(plt, domApi, node, slottedCmps, removeNodes);

        // see if this element has a host id attribute
        ssrHostId = domApi.$getAttribute(node, SSR_HOST_ID);
        if (ssrHostId) {
          // this element is a server side rendered component!!

          // remove the ssr host attribute
          domApi.$removeAttribute(node, SSR_HOST_ID);

          // create a new vnode to fill in with data from the elements
          ssrVNode = {
            vtag: domApi.$tagName(node),
            elm: node,
            ishost: true
          };

          // store this vnode data with the actual element as the key
          plt.vnodeMap.set(node, ssrVNode);

          const slottedCmp: d.SlottedComponent = {
            hostElm: node,
            lightDomNodes: [] as any,
            useShadowDom: (__BUILD_CONDITIONALS__.hasShadowDom && domApi.$supportsShadowDom && ssrHostId.includes(SSR_SHADOW_DOM_HOST_ID))
          };
          slottedCmps.push(slottedCmp);

          if (slottedCmp.useShadowDom) {
            // we know this is host node cuz of the id had some prefix
            // well let's trim it off to get the real host id
            ssrHostId = ssrHostId.substring(1);
          }

          // keep drilling down through child nodes
          addChildNodes(ssrVNode.vtag as string, node, node, NODE_TYPE.ElementNode, ssrVNode, ssrHostId, true, slottedCmp);
        }
      }
    }
  }


  // start drilling down through the dom looking
  // for elements that are actually hydrated components
  hydrateElementFromSsr(rootElm as d.RenderNode);

  // remove all the nodes we identified we no longer need in the dom
  // removeNodes.forEach(removeNode => removeNode.remove());

  // slottedCmps.forEach(slottedCmp => {
  //   if (__BUILD_CONDITIONALS__.hasShadowDom && slottedCmp.useShadowDom) {
  //     // cool so we finished up building a vnode out of the ssr data found in the html
  //     // and turns out that this host element is a component that should use shadow dom
  //     // we've also collected up all of the nodes that should be relocated to the light dom
  //     // now it is time for some pixie dust to magically turn this element to use shadow dom ;)
  //     // If you're reading this, you rock, and we appreciate you. You stay classy San Dieago.

  //     // attach a shadow root to the host element
  //     const shadowRoot = domApi.$attachShadow(slottedCmp.hostElm);

  //     // move all of the current content child nodes into the shadow root
  //     // get all the child nodes of this host element
  //     const childNodes = domApi.$childNodes(slottedCmp.hostElm) as NodeListOf<d.RenderNode>;
  //     for (let i = childNodes.length - 1; i >= 0; i--) {
  //       // relocate all of the host content nodes into the shadow root
  //       const node = childNodes[i];
  //       if (!node['s-cn']) {
  //         // remove from the host content
  //         node.remove();

  //         // add the shadow root
  //         domApi.$insertBefore(shadowRoot, node, shadowRoot.firstChild);
  //       }
  //     }

  //     slottedCmp.lightDomNodes.sort((a, b) => {
  //       if (a.contentIndex < b.contentIndex) return 1;
  //       return -1;
  //     });

  //     slottedCmp.lightDomNodes.forEach(lightDomNode => {
  //       lightDomNode.elm.remove();
  //       domApi.$insertBefore(slottedCmp.hostElm, lightDomNode.elm);
  //     });
  //   }
  // });
}