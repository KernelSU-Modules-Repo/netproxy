import os
import shutil
import subprocess
import sys

# 项目路径配置
WEBUI_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.abspath(os.path.join(WEBUI_DIR, "..", "module", "webroot"))

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

def clear_target_dir():
    """清空目标目录"""
    print(f"清空目标目录: {TARGET_DIR}")
    if os.path.exists(TARGET_DIR):
        file_count = 0
        for item in os.listdir(TARGET_DIR):
            item_path = os.path.join(TARGET_DIR, item)
            # 保留 .gitkeep 文件
            if item == '.gitkeep':
                continue
            if os.path.isfile(item_path):
                os.remove(item_path)
                file_count += 1
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
                file_count += 1
        print(f"  清空了 {file_count} 个文件")
    else:
        os.makedirs(TARGET_DIR, exist_ok=True)
        print(f"  已创建目标目录: {TARGET_DIR}")

def verify_build_files():
    """验证构建文件是否完整"""
    print("验证构建产物完整性...")
    
    critical_files = ['index.html']
    
    all_files = []
    all_dirs = set()
    js_files = []
    css_files = []
    font_files = []
    
    for root, dirs, files in os.walk(TARGET_DIR):
        for dir_name in dirs:
            rel_dir = os.path.relpath(os.path.join(root, dir_name), TARGET_DIR)
            all_dirs.add(rel_dir)
        
        for file in files:
            rel_path = os.path.relpath(os.path.join(root, file), TARGET_DIR)
            all_files.append(rel_path)
            
            if file.endswith('.js'):
                js_files.append(rel_path)
            elif file.endswith('.css'):
                css_files.append(rel_path)
            elif 'MaterialIcons' in file:
                font_files.append(rel_path)
    
    print(f"  找到 {len(all_files)} 个文件和 {len(all_dirs)} 个目录")
    print(f"  所有文件: {all_files}")
    print(f"  JavaScript文件: {js_files}")
    print(f"  CSS文件: {css_files}")
    print(f"  字体文件: {font_files}")
    
    issues = []
    
    for file in critical_files:
        if file not in all_files:
            issues.append(f"缺少核心文件: {file}")
    
    if not js_files:
        issues.append("缺少JavaScript文件")
    if not css_files:
        issues.append("缺少CSS文件")
    if not font_files:
        issues.append("缺少Material Icons字体文件")
    
    if issues:
        print(f"❌ 验证失败: {issues}")
        return False
    else:
        print("✅ 所有关键文件和目录已成功构建")
    
    print(f"总共构建了 {len(all_files)} 个文件和 {len(all_dirs)} 个目录")
    print(f"JavaScript文件: {len(js_files)} 个")
    print(f"CSS文件: {len(css_files)} 个")
    print(f"字体文件: {len(font_files)} 个")
    
    return True

def build_webui():
    """构建webui"""
    print("开始构建webui (Vite)...")
    
    # 清空目标目录
    clear_target_dir()
    
    print(f"执行构建，直接输出到: {TARGET_DIR}")
    run_command(["npm", "run", "build"], cwd=WEBUI_DIR)
    print("构建完成")

def main():
    """主函数"""
    print("=== NetProxy WebUI 构建脚本 (Vite) ===")
    
    build_webui()
    
    success = verify_build_files()
    
    if success:
        print("=== 构建完成 ===")
    else:
        print("=== 构建失败 ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
