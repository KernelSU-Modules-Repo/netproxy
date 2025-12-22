import os
import shutil
import subprocess
import sys

# 项目路径配置
WEBUI_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_OUTPUT_DIR = os.path.join(WEBUI_DIR, "dist")  # 恢复使用中间的dist目录
TARGET_DIR = os.path.abspath(os.path.join(WEBUI_DIR, "..", "NetProxy-Magisk", "webroot"))

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

def clear_dist_dir():
    """清空构建输出目录"""
    print(f"清空构建输出目录: {BUILD_OUTPUT_DIR}")
    if os.path.exists(BUILD_OUTPUT_DIR):
        file_count = sum(len(files) for _, _, files in os.walk(BUILD_OUTPUT_DIR))
        print(f"  清空前目录包含 {file_count} 个文件")
        shutil.rmtree(BUILD_OUTPUT_DIR)
    # 重建dist目录
    os.makedirs(BUILD_OUTPUT_DIR, exist_ok=True)
    print(f"  已重建构建输出目录: {BUILD_OUTPUT_DIR}")

def clear_target_dir():
    """清空目标目录"""
    print(f"清空目标目录: {TARGET_DIR}")
    if os.path.exists(TARGET_DIR):
        file_count = sum(len(files) for _, _, files in os.walk(TARGET_DIR))
        print(f"  清空前目录包含 {file_count} 个文件")
        shutil.rmtree(TARGET_DIR)
    os.makedirs(TARGET_DIR, exist_ok=True)
    print(f"  已重建目标目录: {TARGET_DIR}")

def copy_build_files():
    """复制构建文件到目标目录"""
    print(f"复制构建产物从 {BUILD_OUTPUT_DIR} 到 {TARGET_DIR}")
    
    # 统计源目录文件数量
    src_file_count = sum(len(files) for _, _, files in os.walk(BUILD_OUTPUT_DIR))
    print(f"  源目录包含 {src_file_count} 个文件")
    
    # 复制所有文件和目录
    for item in os.listdir(BUILD_OUTPUT_DIR):
        s = os.path.join(BUILD_OUTPUT_DIR, item)
        d = os.path.join(TARGET_DIR, item)
        if os.path.isdir(s):
            dir_file_count = sum(len(files) for _, _, files in os.walk(s))
            print(f"  复制目录: {item} (包含 {dir_file_count} 个文件)")
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            print(f"  复制文件: {item}")
            shutil.copy2(s, d)
    
    print("复制完成")
    
    # 验证关键文件是否存在
    verify_build_files()

def verify_build_files():
    """验证构建文件是否完整"""
    print("验证构建产物完整性...")
    
    # 关键文件列表
    critical_files = ['index.html']
    critical_types = [
        {'ext': 'js', 'desc': 'JavaScript文件'},
        {'ext': 'css', 'desc': 'CSS文件'},
        {'pattern': 'MaterialIcons', 'desc': 'Material Icons字体文件'}
    ]
    
    all_files = []
    all_dirs = set()
    js_files = []
    css_files = []
    font_files = []
    
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
            elif 'MaterialIcons' in file:
                font_files.append(rel_path)
    
    # 显示找到的文件类型统计
    print(f"  找到 {len(all_files)} 个文件和 {len(all_dirs)} 个目录")
    print(f"  所有文件: {all_files}")
    print(f"  JavaScript文件: {js_files}")
    print(f"  CSS文件: {css_files}")
    print(f"  字体文件: {font_files}")
    
    # 检查关键文件和类型
    issues = []
    
    # 检查精确文件
    for file in critical_files:
        if file not in all_files:
            issues.append(f"缺少核心文件: {file}")
    
    # 检查类型文件
    if not js_files:
        issues.append("缺少JavaScript文件")
    if not css_files:
        issues.append("缺少CSS文件")
    if not font_files:
        issues.append("缺少Material Icons字体文件")
    
    if issues:
        print(f"❌ 验证失败: {issues}")
    else:
        print("✅ 所有关键文件和目录已成功复制")
    
    print(f"总共复制了 {len(all_files)} 个文件和 {len(all_dirs)} 个目录")
    print(f"JavaScript文件: {len(js_files)} 个")
    print(f"CSS文件: {len(css_files)} 个")
    print(f"字体文件: {len(font_files)} 个")
    
    return len(issues) == 0

def build_webui():
    """构建webui"""
    print("开始构建webui...")
    
    # 清空构建输出目录，避免旧文件残留
    clear_dist_dir()
    
    # 执行构建（输出到中间的dist目录）
    print("执行构建...")
    run_command(["npm", "run", "build", "--", "--dist-dir", "dist"], cwd=WEBUI_DIR)
    print("构建完成")
    
    # 复制assets目录到构建输出目录（dist目录）
    copy_assets_to_dist()
    
    # 检查构建产物是否存在
    if not os.path.exists(BUILD_OUTPUT_DIR):
        print(f"构建产物目录不存在: {BUILD_OUTPUT_DIR}")
        sys.exit(1)
    
    # 检查dist目录是否有内容
    if not os.listdir(BUILD_OUTPUT_DIR):
        print(f"构建产物目录为空: {BUILD_OUTPUT_DIR}")
        sys.exit(1)

def copy_assets_to_dist():
    """复制必要的资源文件到构建输出目录"""
    print("复制必要的资源文件到构建输出目录...")
    
    # 无需复制额外HTML文件，index.html已包含所有内容
    print("无需复制额外HTML文件（所有内容已内嵌在index.html中）")
    
    print("必要资源文件复制完成")

def main():
    """主函数"""
    print("=== NetProxy WebUI 构建脚本 ===")
    
    # 在构建开始前清空目标目录，避免旧文件残留
    clear_target_dir()
    
    # 构建webui（输出到中间的dist目录）
    build_webui()
    
    # 复制文件到目标目录
    copy_build_files()
    
    print("=== 构建完成 ===")
    
    # 清理中间dist目录
    print("清理中间dist目录...")
    shutil.rmtree(BUILD_OUTPUT_DIR)
    print("中间dist目录清理完成")
    
    print("=== 最终构建完成 ===")

if __name__ == "__main__":
    main()
