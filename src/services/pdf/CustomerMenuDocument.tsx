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
    paddingTop: 76,
    paddingHorizontal: 27,
    paddingBottom: 24,
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: 20,
    left: 27,
    right: 27,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#faf6f2",
    borderLeftWidth: 3,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  logoTile: {
    width: 34,
    height: 34,
    flexShrink: 0,
    marginRight: 9,
    backgroundColor: "#ffffff",
    borderRadius: 4,
    padding: 2,
  },
  logo: { width: 30, height: 30, objectFit: "contain" },
  headerCopy: { flex: 1 },
  company: {
    fontSize: 9,
    fontWeight: 700,
    color: "#5e4e44",
    marginBottom: 1,
  },
  title: { fontSize: 20, fontWeight: 700, color: "#282019" },
  groupHeading: { flexDirection: "row", alignItems: "center", marginBottom: 4, marginTop: 5 },
  category: { fontSize: 13, fontWeight: 700, color: "#282019", marginRight: 8 },
  categoryRule: { flex: 1, height: 1, opacity: 0.45 },
  row: {
    flexDirection: "row",
    columnGap: 6,
    marginBottom: 4,
  },
  card: {
    width: "32.5%",
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderWidth: 0.65,
    borderColor: "#e8ded6",
    borderRadius: 5,
    backgroundColor: "#ffffff",
  },
  photo: {
    width: 29,
    height: 29,
    flexShrink: 0,
    borderRadius: 3,
    objectFit: "cover",
    marginRight: 6,
  },
  photoFallback: {
    width: 29,
    height: 29,
    flexShrink: 0,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: "#faf6f2",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackPlate: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackPlateInner: {
    width: 8,
    height: 8,
    borderWidth: 0.65,
    borderRadius: 4,
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 2,
    fontSize: 9.5,
    lineHeight: 1.18,
    fontWeight: 700,
    color: "#282019",
  },
});

function safeAccentColor(value?: string | null): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#ed3024";
}

export function CustomerMenuDocument({ data }: { data: CustomerMenuPdfData }) {
  const accent = safeAccentColor(data.accentColor);

  const renderRow = (items: CustomerMenuPdfItem[]) => (
    <View key={items[0].id} style={styles.row} wrap={false}>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
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
  );

  return (
    <Document
      title={`${data.companyName} Menu`}
      author={data.companyName}
      subject="Food menu"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={[styles.header, { borderLeftColor: accent }]} fixed>
          {data.logoUrl && (
            <View style={styles.logoTile}>
              <Image src={data.logoUrl} style={styles.logo} />
            </View>
          )}
          <View style={styles.headerCopy}>
            <Text style={styles.company}>{data.companyName}</Text>
            <Text style={styles.title}>Our Menu</Text>
          </View>
        </View>

        {data.groups.filter((group) => group.items.length > 0).flatMap((group) => {
          const rows: CustomerMenuPdfItem[][] = [];
          for (let index = 0; index < group.items.length; index += 3) {
            rows.push(group.items.slice(index, index + 3));
          }
          return [
            <View key={group.category} wrap={false}>
              <View style={styles.groupHeading}>
                <Text style={styles.category}>{group.category}</Text>
                <View style={[styles.categoryRule, { backgroundColor: accent }]} />
              </View>
              {renderRow(rows[0])}
            </View>,
            ...rows.slice(1).map(renderRow),
          ];
        })}
      </Page>
    </Document>
  );
}
