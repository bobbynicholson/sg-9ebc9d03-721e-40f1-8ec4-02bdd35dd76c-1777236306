import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

/* eslint-disable jsx-a11y/alt-text */

export interface CustomerMenuPdfItem {
  id: string;
  name: string;
  image_url?: string | null;
}

export interface CustomerMenuPdfGroup {
  category: string;
  items: CustomerMenuPdfItem[];
}

export interface CustomerMenuPdfData {
  companyName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  groups: CustomerMenuPdfGroup[];
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#172033",
    paddingTop: 82,
    paddingHorizontal: 34,
    paddingBottom: 30,
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: 20,
    left: 34,
    right: 34,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5eaf1",
    paddingBottom: 9,
  },
  logo: {
    width: 34,
    height: 34,
    objectFit: "contain",
    marginRight: 9,
  },
  brandMark: {
    width: 7,
    height: 32,
    borderRadius: 4,
    marginRight: 11,
  },
  headerCopy: { flexGrow: 1 },
  company: {
    fontSize: 9,
    color: "#64748b",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  title: { fontSize: 19, fontWeight: 700, color: "#101828" },
  group: { marginBottom: 12 },
  groupHeading: {
    fontSize: 12,
    fontWeight: 700,
    color: "#152238",
    paddingBottom: 5,
    marginBottom: 7,
    borderBottomWidth: 1.25,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "31.8%",
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: "#e6ebf2",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  photo: {
    width: 38,
    height: 38,
    borderRadius: 6,
    objectFit: "cover",
    marginRight: 7,
  },
  photoFallback: {
    width: 38,
    height: 38,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: "#fff2ef",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackPlate: {
    width: 23,
    height: 23,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackPlateInner: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderRadius: 6,
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 1.25,
    fontWeight: 600,
    color: "#172033",
  },
});

function safeAccentColor(value?: string | null): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#ed3024";
}

export function CustomerMenuDocument({ data }: { data: CustomerMenuPdfData }) {
  const accent = safeAccentColor(data.accentColor);

  return (
    <Document
      title={`${data.companyName} Menu`}
      author={data.companyName}
      subject="Food menu"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed wrap={false}>
          {data.logoUrl ? (
            <Image src={data.logoUrl} style={styles.logo} />
          ) : (
            <View style={[styles.brandMark, { backgroundColor: accent }]} />
          )}
          <View style={styles.headerCopy}>
            <Text style={styles.company}>{data.companyName}</Text>
            <Text style={styles.title}>Our Menu</Text>
          </View>
        </View>

        {data.groups.map((group) => (
          <View key={group.category} style={styles.group}>
            <Text style={[styles.groupHeading, { borderBottomColor: accent }]}>
              {group.category}
            </Text>
            <View style={styles.grid}>
              {group.items.map((item) => (
                <View key={item.id} style={styles.card} wrap={false}>
                  {item.image_url ? (
                    <Image src={item.image_url} style={styles.photo} />
                  ) : (
                    <View style={styles.photoFallback}>
                      <View style={[styles.fallbackPlate, { borderColor: accent }]}>
                        <View style={[styles.fallbackPlateInner, { borderColor: accent }]} />
                      </View>
                    </View>
                  )}
                  <Text style={styles.itemName}>{item.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
