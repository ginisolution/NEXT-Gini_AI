"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    duration: 30,
    avatarDesignMode: "preset" as "preset" | "custom",
    avatarDesignSettings: {
      gender: "female" as "male" | "female",
      ageRange: "30s" as "20s" | "30s" | "40s" | "50s",
      style: "professional" as "professional" | "casual" | "friendly",
      expression: "neutral" as "neutral" | "smile" | "confident",
      background: "gradient" as "gradient" | "solid" | "office",
      nationality: "korean" as "korean" | "japanese" | "american",
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "프로젝트 생성에 실패했습니다.");
      }

      const data = await response.json();
      router.push(`/dashboard/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>새 프로젝트 만들기</CardTitle>
          <CardDescription>
            PDF를 업로드하여 AI 아바타 영상을 생성하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">
              프로젝트 제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              required
              placeholder="예: 2024년 사업 계획 발표"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명 (선택)</Label>
            <Textarea
              id="description"
              placeholder="프로젝트에 대한 간단한 설명"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">
              영상 길이 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.duration.toString()}
              onValueChange={(value) =>
                setFormData({ ...formData, duration: parseInt(value) })
              }
            >
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30초 (빠른 요약)</SelectItem>
                <SelectItem value="60">60초 (표준)</SelectItem>
                <SelectItem value="180">180초 (상세)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              영상 길이에 따라 씬 개수가 자동 조정됩니다
            </p>
          </div>

          <div className="space-y-2">
            <Label>아바타 모드</Label>
            <div className="space-y-3">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="avatarMode"
                  value="preset"
                  checked={formData.avatarDesignMode === "preset"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      avatarDesignMode: e.target.value as "preset",
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">프리셋 아바타</div>
                  <div className="text-sm text-muted-foreground">
                    기본 제공 아바타를 사용합니다 (무료)
                  </div>
                </div>
              </label>
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="avatarMode"
                  value="custom"
                  checked={formData.avatarDesignMode === "custom"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      avatarDesignMode: e.target.value as "custom",
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">커스텀 아바타</div>
                  <div className="text-sm text-muted-foreground">
                    AI로 생성한 맞춤형 아바타 (추가 비용: ~$0.039)
                  </div>
                </div>
              </label>
            </div>

            {/* 커스텀 아바타 상세 설정 */}
            {formData.avatarDesignMode === "custom" && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-4">
                <h4 className="font-medium text-sm">커스텀 아바타 설정</h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* 성별 */}
                  <div className="space-y-2">
                    <Label htmlFor="gender">성별</Label>
                    <Select
                      value={formData.avatarDesignSettings.gender}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          avatarDesignSettings: {
                            ...formData.avatarDesignSettings,
                            gender: value as "male" | "female",
                          },
                        })
                      }
                    >
                      <SelectTrigger id="gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">여성</SelectItem>
                        <SelectItem value="male">남성</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 나이대 */}
                  <div className="space-y-2">
                    <Label htmlFor="ageRange">나이대</Label>
                    <Select
                      value={formData.avatarDesignSettings.ageRange}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          avatarDesignSettings: {
                            ...formData.avatarDesignSettings,
                            ageRange: value as "20s" | "30s" | "40s" | "50s",
                          },
                        })
                      }
                    >
                      <SelectTrigger id="ageRange">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20s">20대</SelectItem>
                        <SelectItem value="30s">30대</SelectItem>
                        <SelectItem value="40s">40대</SelectItem>
                        <SelectItem value="50s">50대</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 국적 */}
                  <div className="space-y-2">
                    <Label htmlFor="nationality">국적</Label>
                    <Select
                      value={formData.avatarDesignSettings.nationality}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          avatarDesignSettings: {
                            ...formData.avatarDesignSettings,
                            nationality: value as "korean" | "japanese" | "american",
                          },
                        })
                      }
                    >
                      <SelectTrigger id="nationality">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="korean">한국</SelectItem>
                        <SelectItem value="japanese">일본</SelectItem>
                        <SelectItem value="american">미국</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 스타일 */}
                  <div className="space-y-2">
                    <Label htmlFor="style">스타일</Label>
                    <Select
                      value={formData.avatarDesignSettings.style}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          avatarDesignSettings: {
                            ...formData.avatarDesignSettings,
                            style: value as "professional" | "casual" | "friendly",
                          },
                        })
                      }
                    >
                      <SelectTrigger id="style">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">전문적</SelectItem>
                        <SelectItem value="casual">캐주얼</SelectItem>
                        <SelectItem value="friendly">친근한</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 표정 */}
                  <div className="space-y-2">
                    <Label htmlFor="expression">표정</Label>
                    <Select
                      value={formData.avatarDesignSettings.expression}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          avatarDesignSettings: {
                            ...formData.avatarDesignSettings,
                            expression: value as "neutral" | "smile" | "confident",
                          },
                        })
                      }
                    >
                      <SelectTrigger id="expression">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="neutral">중립</SelectItem>
                        <SelectItem value="smile">미소</SelectItem>
                        <SelectItem value="confident">자신감</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 배경 */}
                <div className="space-y-2">
                  <Label htmlFor="background">배경</Label>
                  <Select
                    value={formData.avatarDesignSettings.background}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        avatarDesignSettings: {
                          ...formData.avatarDesignSettings,
                          background: value as "gradient" | "solid" | "office",
                        },
                      })
                    }
                  >
                    <SelectTrigger id="background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gradient">그라데이션</SelectItem>
                      <SelectItem value="solid">단색</SelectItem>
                      <SelectItem value="office">오피스</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  설정에 따라 AI가 맞춤형 아바타를 생성합니다 (Nano Banana 이용)
                </p>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            취소
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "생성 중..." : "프로젝트 생성"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
