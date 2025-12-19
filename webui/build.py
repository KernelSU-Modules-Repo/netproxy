import os
import re
import shutil
import subprocess
import sys

# 项目路径配置
WEBUI_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_OUTPUT_DIR = os.path.join(WEBUI_DIR, "dist")
TARGET_DIR = os.path.join(WEBUI_DIR, "..", "NetProxy-Magisk", "webroot")

def run_command(cmd, cwd=None):
    """运行命令并返回结果"""
    cmd_str = ' '.join(cmd)
    print(f"执行命令: {cmd_str}")
    try:
        result = subprocess.run(
            cmd_str,
            cwd=cwd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            shell=True
        )
        print(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        print(f"命令执行失败: {e}")
        print(f"标准输出: {e.stdout}")
        print(f"标准错误: {e.stderr}")
        sys.exit(1)

def ensure_assets_directory():
    """确保assets目录存在于构建输出目录并复制资源文件"""
    print("确保assets目录存在并复制资源文件...")
    
    # 源assets目录
    src_assets_dir = os.path.join(WEBUI_DIR, "src", "assets")
    # 目标assets目录（构建输出目录）
    dest_assets_dir = os.path.join(BUILD_OUTPUT_DIR, "assets")
    
    # 确保目标assets目录存在
    os.makedirs(dest_assets_dir, exist_ok=True)
    
    # 复制assets目录中的所有文件
    if os.path.exists(src_assets_dir):
        for item in os.listdir(src_assets_dir):
            src_item = os.path.join(src_assets_dir, item)
            dest_item = os.path.join(dest_assets_dir, item)
            if os.path.isfile(src_item):
                shutil.copy2(src_item, dest_item)
                print(f"复制文件: {src_item} -> {dest_item}")
    
    print("assets目录处理完成")

def clear_target_dir():
    """清空目标目录"""
    if os.path.exists(TARGET_DIR):
        print(f"清空目标目录: {TARGET_DIR}")
        shutil.rmtree(TARGET_DIR)
    os.makedirs(TARGET_DIR, exist_ok=True)

def copy_build_files():
    """复制构建文件到目标目录"""
    print(f"复制构建产物从 {BUILD_OUTPUT_DIR} 到 {TARGET_DIR}")
    
    # 复制所有文件和目录
    for item in os.listdir(BUILD_OUTPUT_DIR):
        s = os.path.join(BUILD_OUTPUT_DIR, item)
        d = os.path.join(TARGET_DIR, item)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    
    print("复制完成")
    
    # 验证关键文件是否存在
    verify_build_files()

def verify_build_files():
    """验证构建文件是否完整"""
    print("验证构建产物完整性...")
    
    # 关键文件列表（使用更灵活的匹配方式）
    critical_categories = [
        # 必须存在的精确文件
        {'type': 'exact', 'files': ['index.html']},
        # 必须存在的类型文件（至少一个）
        {'type': 'type', 'ext': 'js', 'desc': 'JavaScript文件'},
        {'type': 'type', 'ext': 'css', 'desc': 'CSS文件'},
        # 必须存在的目录和文件
        {'type': 'dir', 'dir': 'assets', 'desc': 'Assets目录'}
    ]
    
    all_files = []
    all_dirs = set()
    js_files = []
    css_files = []
    
    # 遍历目标目录获取所有文件和目录路径
    for root, dirs, files in os.walk(TARGET_DIR):
        # 记录目录
        for dir_name in dirs:
            rel_dir = os.path.relpath(os.path.join(root, dir_name), TARGET_DIR)
            all_dirs.add(rel_dir)
        
        # 记录文件
        for file in files:
            # 获取相对路径
            rel_path = os.path.relpath(os.path.join(root, file), TARGET_DIR)
            all_files.append(rel_path)
            
            # 按类型分类
            if file.endswith('.js'):
                js_files.append(rel_path)
            elif file.endswith('.css'):
                css_files.append(rel_path)
    
    # 检查每个关键类别
    issues = []
    
    for category in critical_categories:
        if category['type'] == 'exact':
            for file in category['files']:
                if file not in all_files:
                    issues.append(f"缺少文件: {file}")
        elif category['type'] == 'type':
            if category['ext'] == 'js' and not js_files:
                issues.append(f"缺少{category['desc']}")
            elif category['ext'] == 'css' and not css_files:
                issues.append(f"缺少{category['desc']}")
        elif category['type'] == 'dir':
            if category['dir'] not in all_dirs:
                issues.append(f"缺少{category['desc']}: {category['dir']}")
    
    # 检查assets目录中的关键文件
    assets_files = [f for f in all_files if 'assets' in f and os.path.dirname(f) == 'assets']
    if not any('mdui' in f for f in assets_files):
        issues.append("assets目录中缺少mdui.css相关文件")
    if not any('material-icons' in f for f in assets_files):
        issues.append("assets目录中缺少material-icons.css相关文件")
    
    if issues:
        print(f"警告: {issues}")
    else:
        print("✅ 所有关键文件和目录已成功复制")
    
    print(f"总共复制了 {len(all_files)} 个文件和 {len(all_dirs)} 个目录")
    print(f"JavaScript文件: {len(js_files)} 个")
    print(f"CSS文件: {len(css_files)} 个")
    print(f"Assets文件: {len(assets_files)} 个")
    
    return len(issues) == 0

def clear_dist_dir():
    """清空构建输出目录"""
    if os.path.exists(BUILD_OUTPUT_DIR):
        print(f"清空构建输出目录: {BUILD_OUTPUT_DIR}")
        shutil.rmtree(BUILD_OUTPUT_DIR)
    # 重建dist目录
    os.makedirs(BUILD_OUTPUT_DIR, exist_ok=True)

def build_webui():
    """构建webui"""
    print("开始构建webui...")
    
    # 清空构建输出目录，避免旧文件残留
    clear_dist_dir()
    
    # 安装依赖
    print("安装依赖...")
    run_command(["npm", "install"], cwd=WEBUI_DIR)
    print("依赖安装完成")
    
    # 执行构建
    print("执行构建...")
    run_command(["npm", "run", "build"], cwd=WEBUI_DIR)
    print("构建完成")
    
    # 检查构建产物是否存在
    if not os.path.exists(BUILD_OUTPUT_DIR):
        print(f"构建产物目录不存在: {BUILD_OUTPUT_DIR}")
        sys.exit(1)
    
    # 确保assets目录存在于构建输出目录
    ensure_assets_directory()

def main():
    """主函数"""
    print("=== NetProxy WebUI 构建脚本 ===")
    
    # 在构建开始前清空目标目录，避免旧文件残留
    clear_target_dir()
    
    # 构建webui
    build_webui()
    
    # 复制文件到目标目录
    copy_build_files()
    
    print("=== 构建完成 ===")

if __name__ == "__main__":
    main()