import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IconButton, IconLink, UploadIconButton } from "./ui";

describe("统一图标操作按钮", () => {
  it("图标按钮默认是 button，并带 aria-label 与悬停提示", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, {
        icon: createElement("span", null, "E"),
        label: "修改",
        onClick: vi.fn(),
      }),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="修改"');
    expect(html).toContain('title="修改"');
    expect(html).toContain("h-8 w-8");
    expect(html).toContain("border-line");
  });

  it("危险操作使用统一的红色描边样式", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, {
        icon: createElement("span", null, "X"),
        label: "删除",
        tone: "danger",
      }),
    );
    expect(html).toContain("text-danger");
    expect(html).toContain("bg-white");
  });

  it("图标链接与图标按钮共用尺寸和提示", () => {
    const html = renderToStaticMarkup(
      createElement(
        IconLink,
        { href: "/download", label: "下载" },
        createElement("span", null, "D"),
      ),
    );
    expect(html).toContain('href="/download"');
    expect(html).toContain('aria-label="下载"');
    expect(html).toContain('title="下载"');
    expect(html).toContain("h-8 w-8");
  });

  it("上传按钮内部包含隐藏的文件选择框", () => {
    const html = renderToStaticMarkup(
      createElement(UploadIconButton, {
        icon: createElement("span", null, "U"),
        label: "上传附件",
        onFile: vi.fn(),
      }),
    );
    expect(html).toContain('title="上传附件"');
    expect(html).toContain('aria-label="上传附件"');
    expect(html).toContain('type="file"');
    expect(html).toContain('class="hidden"');
  });
});
