# SEO 配置检查脚本
# 用于验证部署后的 SEO 配置是否正确

param(
    [string]$Domain = ""
)

Write-Host "`n🔍 SEO 配置检查工具" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not $Domain) {
    $Domain = Read-Host "请输入你的网站域名（例如：https://your-domain.com）"
}

if (-not $Domain) {
    Write-Host "❌ 未提供域名，退出检查" -ForegroundColor Red
    exit 1
}

# 确保域名以 https:// 开头
if (-not $Domain.StartsWith("http://") -and -not $Domain.StartsWith("https://")) {
    $Domain = "https://" + $Domain
}

Write-Host "检查域名: $Domain" -ForegroundColor Yellow
Write-Host ""

# 检查项
$checks = @(
    @{
        Name = "robots.txt"
        Url = "$Domain/robots.txt"
        Expected = "User-agent"
    },
    @{
        Name = "sitemap.xml"
        Url = "$Domain/api/seo/sitemap.xml"
        Expected = "<?xml"
    },
    @{
        Name = "首页 Meta 标签"
        Url = "$Domain/"
        Expected = "百体汇 - 免费看体育直播"
    }
)

$allPassed = $true

foreach ($check in $checks) {
    Write-Host "检查: $($check.Name)..." -ForegroundColor Yellow -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $check.Url -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        
        if ($response.Content -match $check.Expected) {
            Write-Host " ✅ 通过" -ForegroundColor Green
            Write-Host "   URL: $($check.Url)" -ForegroundColor Gray
        } else {
            Write-Host " ⚠️  内容可能不正确" -ForegroundColor Yellow
            Write-Host "   URL: $($check.Url)" -ForegroundColor Gray
            $allPassed = $false
        }
    } catch {
        Write-Host " ❌ 失败" -ForegroundColor Red
        Write-Host "   错误: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   URL: $($check.Url)" -ForegroundColor Gray
        $allPassed = $false
    }
    
    Write-Host ""
}

# 总结
Write-Host "============================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "✅ 所有检查通过！" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步：" -ForegroundColor Yellow
    Write-Host "1. 在 Google Search Console 提交 sitemap: $Domain/api/seo/sitemap.xml" -ForegroundColor White
    Write-Host "2. 在百度站长平台提交 sitemap: $Domain/api/seo/sitemap.xml" -ForegroundColor White
    Write-Host "3. 等待 1-2 周，查看搜索引擎收录情况" -ForegroundColor White
} else {
    Write-Host "⚠️  部分检查未通过，请检查配置" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "可能的原因：" -ForegroundColor Yellow
    Write-Host "1. 网站未部署或域名不正确" -ForegroundColor White
    Write-Host "2. 环境变量 SITE_URL 未设置" -ForegroundColor White
    Write-Host "3. 服务器路由配置问题" -ForegroundColor White
}

Write-Host ""

