import React from "react";
import { StyleSheet, Text, View, type TextProps, type ViewProps } from "@react-pdf/renderer";

const frame = StyleSheet.create({
  // React-PDF strips the container's top/bottom borders when splitting it.
  // Fixed children repeat inside EACH fragment, including the final one.
  top: { position: "absolute", top: 0, left: 0, right: 0, borderTopWidth: 1, borderColor: "#e7e5e4" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, borderBottomWidth: 1, borderColor: "#e7e5e4" },
  flowing: { paddingTop: 0, borderTopWidth: 0, borderBottomWidth: 0, borderRadius: 0 },
});

/** A closed frame and section heading on every page containing this section.
 * The heading provides its own top inset, because container padding is also
 * removed by React-PDF on continuation pages. Small panels can stay intact.
 */
export function FlowingCard({ title, style, headingStyle, children, wrap = true, inset = 10 }: {
  title: string;
  style: ViewProps["style"];
  headingStyle: TextProps["style"];
  children: React.ReactNode;
  wrap?: boolean;
  inset?: number;
}) {
  return (
    <View style={[...(Array.isArray(style) ? style : [style]), wrap ? frame.flowing : {}]} wrap={wrap}>
      {wrap ? <View style={frame.top} fixed /> : null}
      <Text
        style={[...(Array.isArray(headingStyle) ? headingStyle : [headingStyle]), wrap ? { paddingTop: inset } : {}]}
        fixed={wrap}
        minPresenceAhead={28}
      >{title}</Text>
      {children}
      {wrap ? <View style={frame.bottom} fixed /> : null}
    </View>
  );
}
