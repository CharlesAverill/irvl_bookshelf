cont = input("This is a tough one to get out of. Use ctrl-c as a backup. Continue? (y/n) ")
if not "y" in cont:
    quit()

print("CHALLENGE: EXIT INTERPRETER USING A VALID PYTHON 3.10 PAYLOAD")

import builtins
import readline

input = builtins.input
exec = builtins.exec
print = builtins.print
exit = None
quit = None
len = builtins.len
Exception = builtins.Exception
des = delattr

for a in list(__builtins__.__dict__):
    des(__builtins__, a)

del des
__builtins__ = {}

user_input = ""
defining_multiline = False
while True:
    try:
        if defining_multiline:
            user_input += "\n"
        user_input += input("... " if defining_multiline else ">>> ")
        if not len(user_input):
            defining_multiline = False

        # Exec the code
        if "".join(user_input.split()) in ["quit()", "exit()"]:
            print("Good luck!")
        elif "exec" not in user_input:
            print(exec(user_input))
        # Empty the input buffer
        user_input = ""
        defining_multiline = False
    except Exception as e:
        if not defining_multiline and e.__class__.__name__ == "IndentationError" and user_input.endswith(":"):
            defining_multiline = True
        elif defining_multiline:
            # traceback.print_exc()
            continue
        else:
            user_input = ""
            defining_multiline = False
            print(e.__class__, e)
