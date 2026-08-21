"use client";
/**
 * PropertiesPanel – contextual shape-properties toolbox.
 *
 * Rendered inside #canvas-wrap as an absolutely-positioned floating panel.
 * The panel is always present in the DOM but hidden (class "hide") until a
 * drawing tool is selected or a canvas object is clicked.
 *
 * Visibility of individual *sections* (pp-*-section) is controlled by
 * CanvasEngine.showPropertiesPanelForShape() via classList manipulation so
 * that only options relevant to the active shape type are visible.
 */

import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

import {
  ColorsSection,
  StrokeWidthSection,
  StrokeDashSection,
  FillPatternSection,
  BorderRadiusSection,
  SloppinessSection,
  ArrowTypeSection,
  ArrowHeadSection,
  OpacitySection,
  LayerControlsSection,
  LinkSection,
  GroupingSection,
  MermaidSection
} from "./properties-panel";

type PropsPanelProps = { call: SketchGitCall };

export const PropertiesPanel = React.memo(function PropertiesPanel({ call }: PropsPanelProps) {
  const t = useTranslations("toolbar");

  return (
    <div id="props-panel" className="hide" role="complementary" aria-label={t("shapeProperties")}>
      <ColorsSection call={call} />
      <StrokeWidthSection call={call} />
      <StrokeDashSection call={call} />
      <FillPatternSection call={call} />
      <BorderRadiusSection call={call} />
      <SloppinessSection call={call} />
      <ArrowTypeSection call={call} />
      <ArrowHeadSection call={call} />
      <OpacitySection call={call} />
      <LayerControlsSection call={call} />
      <LinkSection call={call} />
      <GroupingSection call={call} />
      <MermaidSection call={call} />
    </div>
  );
});
